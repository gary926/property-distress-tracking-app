#!/usr/bin/env node
// Stress-test harness for the distress score.
//
// Three modes:
//   npm run score -- --case price=1000000,sqft=1000,buildingPsf=1400
//       one listing, full component breakdown.
//   npm run score -- --sweep buildingPsf=800:1600:100 --case price=1000000,sqft=1000
//       vary one field, table the result — this is where cliffs show up.
//   npm run score -- --data seed/first-sweep.json
//       score a real batch: distribution, tier counts, top rows.
//
// Fields: price, sqft, beds, buildingPsf, areaPsf, benchmarkPsf, listedDate,
// relistCount, keywords (pipe-separated), history (pipe-separated prices,
// oldest first). Settings: dropThreshold, wPriceDrop, wBelowMarket, wKeyword,
// wStaleness, staleDays.

import { readFileSync } from "node:fs";
import { defaultScoring, scoreListing } from "../src/shared/scoring";
import type { Listing, ScoringSettings } from "../src/shared/types";

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

function parsePairs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of text.split(",")) {
    const i = pair.indexOf("=");
    if (i > 0) out[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return out;
}

function buildListing(f: Record<string, string>): Listing {
  const price = Number(f.price ?? 1_000_000);
  const history = f.history
    ? f.history.split("|").map((p, i, a) => ({
        date: daysAgo((a.length - 1 - i) * 30),
        price: Number(p),
      }))
    : [{ date: f.listedDate ?? today, price }];
  // The last history point is the asking price, matching how the worker builds
  // history from successive ingests.
  if (history[history.length - 1].price !== price) {
    history.push({ date: today, price });
  }
  return {
    id: "sandbox",
    listingType: "sale",
    title: "Sandbox unit",
    building: "Test Tower",
    community: "Testville",
    emirate: "Dubai",
    type: "Apartment",
    beds: Number(f.beds ?? 2),
    baths: 2,
    sqft: Number(f.sqft ?? 1000),
    askingPrice: price,
    priceHistory: history,
    buildingPsf: f.buildingPsf ? Number(f.buildingPsf) : undefined,
    areaPsf: f.areaPsf ? Number(f.areaPsf) : undefined,
    benchmarkPsf: f.benchmarkPsf ? Number(f.benchmarkPsf) : undefined,
    benchmarkSource: "Portal published",
    listedDate: f.listedDate ?? today,
    relistCount: Number(f.relistCount ?? 0),
    keywords: f.keywords ? f.keywords.split("|") : [],
    description: "",
    portals: ["Bayut"],
    agent: { name: "A", phone: "" },
    imageHue: 200,
    comps: [],
    firstSeen: f.listedDate ?? today,
  };
}

function buildSettings(f: Record<string, string>): ScoringSettings {
  return {
    ...defaultScoring,
    dropThresholdPct: Number(f.dropThreshold ?? defaultScoring.dropThresholdPct),
    stalenessCutoffDays: Number(f.staleDays ?? defaultScoring.stalenessCutoffDays),
    weights: {
      priceDrop: Number(f.wPriceDrop ?? defaultScoring.weights.priceDrop),
      belowMarket: Number(f.wBelowMarket ?? defaultScoring.weights.belowMarket),
      keyword: Number(f.wKeyword ?? defaultScoring.weights.keyword),
      staleness: Number(f.wStaleness ?? defaultScoring.weights.staleness),
    },
  };
}

const args = process.argv.slice(2);
const argOf = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const fields = parsePairs(argOf("--case") ?? "");
const settings = buildSettings(fields);
const sweep = argOf("--sweep");
const dataFile = argOf("--data");

if (dataFile) {
  const raw = JSON.parse(readFileSync(dataFile, "utf8"));
  const rows: Listing[] = Array.isArray(raw) ? raw : raw.listings;
  const scored = rows.map((l) => scoreListing(l, settings)).sort((a, b) => b.score - a.score);
  const buckets = [0, 10, 20, 30, 45, 60, 70, 100];
  console.log(`${scored.length} listings\n`);
  console.log("score distribution");
  for (let i = 0; i < buckets.length - 1; i++) {
    const n = scored.filter((s) => s.score >= buckets[i] && s.score < buckets[i + 1]).length;
    console.log(
      `  ${String(buckets[i]).padStart(3)}–${String(buckets[i + 1] - 1).padEnd(3)} ${"█".repeat(n)} ${n}`,
    );
  }
  const by = (k: string) => scored.filter((s) => s.belowMarketBasis === k).length;
  console.log(
    `\ntiers   hot ${scored.filter((s) => s.tier === "hot").length}` +
      `  warm ${scored.filter((s) => s.tier === "warm").length}` +
      `  watch ${scored.filter((s) => s.tier === "watch").length}`,
  );
  console.log(`basis   building ${by("building")}  area ${by("area")}  none ${by("none")}`);
  console.log("\ntop 10");
  for (const d of scored.slice(0, 10)) {
    console.log(
      `${String(d.score).padStart(3)} ${d.tier.padEnd(5)} ${d.building.slice(0, 24).padEnd(25)}` +
        ` ${d.belowMarketBasis.padEnd(8)} ${(Math.round(d.belowMarketPct) + "%").padStart(5)}` +
        `  ${d.signals.map((s) => `${s.kind}:${s.points}`).join(" ")}`,
    );
  }
} else if (sweep) {
  const [field, range] = sweep.split("=");
  const [from, to, step] = range.split(":").map(Number);
  console.log(`sweeping ${field} from ${from} to ${to} step ${step}\n`);
  console.log("value      score  tier   basis     below%  components");
  for (let v = from; v <= to; v += step) {
    const d = scoreListing(buildListing({ ...fields, [field]: String(v) }), settings);
    console.log(
      `${String(v).padStart(9)}  ${String(d.score).padStart(5)}  ${d.tier.padEnd(6)}` +
        ` ${d.belowMarketBasis.padEnd(9)} ${(Math.round(d.belowMarketPct) + "%").padStart(6)}` +
        `  ${d.signals.map((s) => `${s.kind}:${s.points}`).join(" ") || "—"}`,
    );
  }
} else {
  const d = scoreListing(buildListing(fields), settings);
  console.log(`asking      AED ${d.askingPrice.toLocaleString()}  (${Math.round(d.psf)}/sqft)`);
  console.log(`score       ${d.score}  → ${d.tier}`);
  console.log(
    `drop        ${d.dropPct.toFixed(1)}% from original` +
      ` (threshold ${settings.dropThresholdPct}%)`,
  );
  console.log(
    `below mkt   basis=${d.belowMarketBasis}` +
      `  building=${d.belowBuildingPct === null ? "—" : d.belowBuildingPct.toFixed(1) + "%"}` +
      `  area=${d.belowAreaPct === null ? "—" : d.belowAreaPct.toFixed(1) + "%"}`,
  );
  console.log(`days on mkt ${d.daysOnMarket}  relists ${d.relistCount}`);
  console.log("\ncomponents");
  if (d.signals.length === 0) console.log("  (none fired)");
  for (const s of d.signals) {
    console.log(`  ${String(s.points).padStart(3)}  ${s.kind.padEnd(13)} ${s.detail}`);
  }
}
