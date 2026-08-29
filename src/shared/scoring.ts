import type {
  Listing,
  ScoredListing,
  ScoringSettings,
  Signal,
  Tier,
} from "./types";
import { daysBetween } from "./format";

export const defaultScoring: ScoringSettings = {
  dropThresholdPct: 10,
  weights: { priceDrop: 35, belowMarket: 30, keyword: 20, staleness: 15 },
  stalenessCutoffDays: 90,
  keywords: [
    "urgent sale",
    "distress",
    "motivated seller",
    "below original price",
    "mortgage settlement",
    "leaving country",
    "bank foreclosure",
    "auction",
  ],
};

export function tierFor(score: number): Tier {
  if (score >= 70) return "hot";
  if (score >= 45) return "warm";
  return "watch";
}

/**
 * Composite Distress Score. Each weighted component saturates independently so
 * one extreme signal cannot dominate the whole score.
 */
export function scoreListing(
  listing: Listing,
  settings: ScoringSettings = defaultScoring,
): ScoredListing {
  const signals: Signal[] = [];
  const { weights } = settings;

  // Ingested listings may arrive before the worker has built any history, and
  // partial upserts can omit array fields — never let that throw.
  const priceHistory =
    Array.isArray(listing.priceHistory) && listing.priceHistory.length > 0
      ? listing.priceHistory
      : [{ date: listing.listedDate ?? listing.firstSeen, price: listing.askingPrice }];
  const keywords = Array.isArray(listing.keywords) ? listing.keywords : [];

  const original = priceHistory[0]?.price ?? listing.askingPrice;
  const dropPct = original > 0 ? ((original - listing.askingPrice) / original) * 100 : 0;
  const cuts = countPriceCuts({ ...listing, priceHistory });
  if (dropPct >= settings.dropThresholdPct) {
    // Saturates at 2× the configured threshold.
    const points = Math.round(
      Math.min(dropPct / (settings.dropThresholdPct * 2), 1) * weights.priceDrop,
    );
    signals.push({
      kind: "price_drop",
      label: "Significant price drop",
      detail: `Asking price is ${dropPct.toFixed(1)}% below the original listing price${cuts > 1 ? ` after ${cuts} reductions` : ""}.`,
      points,
    });
  }

  const psf = listing.askingPrice / listing.sqft;
  const belowMarketPct =
    listing.benchmarkPsf > 0 ? ((listing.benchmarkPsf - psf) / listing.benchmarkPsf) * 100 : 0;
  if (belowMarketPct >= 5) {
    const points = Math.round(Math.min(belowMarketPct / 30, 1) * weights.belowMarket);
    signals.push({
      kind: "below_market",
      label: "Below market value",
      detail: `AED ${Math.round(psf).toLocaleString()}/sqft vs ${listing.building || listing.community} average of AED ${Math.round(listing.benchmarkPsf).toLocaleString()}/sqft (${listing.benchmarkSource}) — ${belowMarketPct.toFixed(0)}% below.`,
      points,
    });
  }

  const matched = keywords.filter((k) =>
    settings.keywords.some((s) => k.toLowerCase().includes(s) || s.includes(k.toLowerCase())),
  );
  if (matched.length > 0) {
    const points = Math.round(Math.min(matched.length / 2, 1) * weights.keyword);
    signals.push({
      kind: "keyword",
      label: "Urgency language in listing",
      detail: `Listing text mentions ${matched.map((k) => `“${k}”`).join(", ")}.`,
      points,
    });
  }

  const daysOnMarket = daysBetween(listing.listedDate);
  if (daysOnMarket >= settings.stalenessCutoffDays || listing.relistCount > 0) {
    const stalePart = Math.min(daysOnMarket / (settings.stalenessCutoffDays * 2), 1);
    const relistPart = Math.min(listing.relistCount / 2, 1);
    const points = Math.round(Math.max(stalePart, relistPart) * weights.staleness);
    const reasons: string[] = [];
    if (daysOnMarket >= settings.stalenessCutoffDays)
      reasons.push(`${daysOnMarket} days on market`);
    if (listing.relistCount > 0)
      reasons.push(
        `relisted ${listing.relistCount} time${listing.relistCount > 1 ? "s" : ""} at a lower price`,
      );
    signals.push({
      kind: listing.relistCount > 0 ? "relist" : "stale",
      label: "Stale / relisted",
      detail: `${reasons.join("; ")} — a squeezed seller pattern.`,
      points,
    });
  }

  const score = Math.min(
    99,
    signals.reduce((sum, s) => sum + s.points, 0),
  );

  return {
    ...listing,
    priceHistory,
    score,
    tier: tierFor(score),
    signals: signals.sort((a, b) => b.points - a.points),
    dropPct,
    psf,
    belowMarketPct,
    daysOnMarket,
  };
}

export function countPriceCuts(listing: Listing): number {
  let cuts = 0;
  for (let i = 1; i < listing.priceHistory.length; i++) {
    if (listing.priceHistory[i].price < listing.priceHistory[i - 1].price) cuts++;
  }
  return cuts;
}
