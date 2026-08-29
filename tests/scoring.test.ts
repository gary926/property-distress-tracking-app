import { describe, expect, it } from "vitest";
import { countPriceCuts, defaultScoring, scoreListing, tierFor } from "../src/shared/scoring";
import { listings } from "../src/shared/mockData";
import type { Listing } from "../src/shared/types";

const base: Listing = {
  id: "t1",
  title: "Test unit",
  building: "Test Tower",
  community: "Testville",
  emirate: "Dubai",
  type: "Apartment",
  beds: 1,
  baths: 1,
  sqft: 1000,
  askingPrice: 1_000_000,
  priceHistory: [{ date: "2026-01-01", price: 1_000_000 }],
  benchmarkPsf: 1000,
  benchmarkSource: "DLD transactions",
  listedDate: "2026-08-01",
  relistCount: 0,
  keywords: [],
  description: "",
  portals: ["Bayut"],
  agent: { name: "A", phone: "0" },
  imageHue: 100,
  comps: [],
  firstSeen: "2026-08-01",
};

describe("scoreListing", () => {
  it("gives a listing at market with no signals a zero score", () => {
    const scored = scoreListing(base);
    expect(scored.score).toBe(0);
    expect(scored.signals).toHaveLength(0);
    expect(scored.tier).toBe("watch");
  });

  it("fires the price-drop signal only above the configured threshold", () => {
    const under = scoreListing({
      ...base,
      askingPrice: 950_000, // 5% drop, threshold 10%
      priceHistory: [
        { date: "2026-01-01", price: 1_000_000 },
        { date: "2026-06-01", price: 950_000 },
      ],
    });
    expect(under.signals.find((s) => s.kind === "price_drop")).toBeUndefined();

    const over = scoreListing({
      ...base,
      askingPrice: 850_000, // 15% drop
      priceHistory: [
        { date: "2026-01-01", price: 1_000_000 },
        { date: "2026-06-01", price: 850_000 },
      ],
    });
    const signal = over.signals.find((s) => s.kind === "price_drop");
    expect(signal).toBeDefined();
    expect(signal!.points).toBeGreaterThan(0);
    expect(over.dropPct).toBeCloseTo(15);
  });

  it("fires below-market from the benchmark psf", () => {
    const scored = scoreListing({ ...base, askingPrice: 800_000 }); // 800 psf vs 1000 avg
    const signal = scored.signals.find((s) => s.kind === "below_market");
    expect(signal).toBeDefined();
    expect(scored.belowMarketPct).toBeCloseTo(20);
  });

  it("matches configured keywords case-insensitively", () => {
    const scored = scoreListing({ ...base, keywords: ["Urgent Sale"] });
    expect(scored.signals.find((s) => s.kind === "keyword")).toBeDefined();
  });

  it("caps the total score at 99", () => {
    const extreme = scoreListing({
      ...base,
      askingPrice: 500_000,
      priceHistory: [
        { date: "2025-01-01", price: 1_000_000 },
        { date: "2026-06-01", price: 500_000 },
      ],
      keywords: ["urgent sale", "distress", "mortgage settlement"],
      listedDate: "2025-01-01",
      relistCount: 3,
    });
    expect(extreme.score).toBeLessThanOrEqual(99);
    expect(extreme.tier).toBe("hot");
  });

  it("respects custom weights", () => {
    const noKeywordWeight = scoreListing(
      { ...base, keywords: ["urgent sale"] },
      { ...defaultScoring, weights: { ...defaultScoring.weights, keyword: 0 } },
    );
    expect(noKeywordWeight.score).toBe(0);
  });
});

describe("tierFor", () => {
  it("maps scores to tiers at the documented boundaries", () => {
    expect(tierFor(70)).toBe("hot");
    expect(tierFor(69)).toBe("warm");
    expect(tierFor(45)).toBe("warm");
    expect(tierFor(44)).toBe("watch");
  });
});

describe("countPriceCuts", () => {
  it("counts only downward moves", () => {
    expect(
      countPriceCuts({
        ...base,
        priceHistory: [
          { date: "2026-01-01", price: 100 },
          { date: "2026-02-01", price: 90 },
          { date: "2026-03-01", price: 95 },
          { date: "2026-04-01", price: 80 },
        ],
      }),
    ).toBe(2);
  });
});

describe("demo snapshot", () => {
  it("every listing scores without throwing and covers all tiers", () => {
    const scored = listings.map((l) => scoreListing(l));
    const tiers = new Set(scored.map((s) => s.tier));
    expect(scored.every((s) => s.score >= 0 && s.score <= 99)).toBe(true);
    expect(tiers.has("hot")).toBe(true);
    expect(tiers.has("watch")).toBe(true);
  });

  it("listing ids are unique", () => {
    expect(new Set(listings.map((l) => l.id)).size).toBe(listings.length);
  });
});
