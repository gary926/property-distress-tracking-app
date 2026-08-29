// Entry bundled by the fixtures preview server (scripts/preview-fixtures.mjs).
import { listings } from "./mockData";
import { defaultScoring, scoreListing } from "./scoring";
import type { AlertSettings, ScoringSettings } from "./types";

export { listings };

/** Digest over the demo snapshot: "last 24h" is taken relative to the newest
 *  firstSeen in the dataset so the preview always has content. */
export function buildFixtureDigest(
  alerts: AlertSettings | null,
  scoring: ScoringSettings | null,
) {
  const scored = listings.map((l) => scoreListing(l, scoring ?? defaultScoring));
  const newest = scored.reduce((max, d) => (d.firstSeen > max ? d.firstSeen : max), "");
  const minScore = alerts?.email.minScore ?? 50;
  const fresh = scored
    .filter((d) => d.firstSeen === newest && d.score >= minScore)
    .sort((a, b) => b.score - a.score);
  return {
    generatedAt: new Date().toISOString(),
    source: "demo",
    recipient: alerts?.email.address ?? null,
    subject: `Distress Radar — ${fresh.length} new deal${fresh.length === 1 ? "" : "s"} in the last 24h`,
    deals: fresh.map((d) => ({
      id: d.id,
      title: `${d.building} · ${d.title}`,
      location: `${d.community}, ${d.emirate}`,
      price: d.askingPrice,
      score: d.score,
      tier: d.tier,
      dropPct: Math.round(d.dropPct),
      belowMarketPct: Math.round(d.belowMarketPct),
      topSignal: d.signals[0]?.label ?? null,
    })),
  };
}
