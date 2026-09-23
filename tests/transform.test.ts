import { describe, expect, it } from "vitest";
// @ts-expect-error - plain .mjs helper shared with the sweep pipeline
import { transform } from "../scripts/transform-listings.mjs";

const saleRow = (over: Record<string, unknown> = {}) => ({
  title: "2BR with marina view",
  buildingOrTowerName: "Test Tower",
  communityArea: "Dubai Marina, Dubai",
  priceAED: 2_000_000,
  bedrooms: 2,
  sizeSqft: 1000,
  listingURL: "https://www.bayut.com/property/details-1234567.html",
  ...over,
});

describe("sale-only filter", () => {
  it("drops listings whose URL is a rental path", () => {
    const out = transform({
      listings: [
        saleRow(),
        saleRow({ listingURL: "https://www.bayut.com/to-rent/apartments/dubai/details-999111.html" }),
        saleRow({ listingURL: "https://www.propertyfinder.ae/en/rent/apartment-for-rent-222333.html" }),
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].listingType).toBe("sale");
  });

  it("drops listings priced per year or per month", () => {
    const out = transform({
      listings: [
        saleRow(),
        saleRow({ listingURL: "https://www.bayut.com/property/details-777888.html", pricePeriod: "Yearly" }),
        saleRow({ listingURL: "https://www.bayut.com/property/details-777889.html", title: "1BR for rent | Marina" }),
      ],
    });
    expect(out).toHaveLength(1);
  });

  it("does not mistake an instalment plan for a rental", () => {
    // Real Bayut sale listing: "1% MONTHLY PAYMENT PLAN | BOUTIQUE | JVC |
    // STUDIO | CASH DEAL". Matching "monthly" in a title dropped it.
    const out = transform({
      listings: [saleRow({ title: "1% MONTHLY PAYMENT PLAN | BOUTIQUE | JVC | STUDIO | CASH DEAL" })],
    });
    expect(out).toHaveLength(1);
  });

  it("keeps a listing whose purpose says sale even on an odd URL", () => {
    const out = transform({
      listings: [saleRow({ purpose: "for-sale", listingURL: "https://example.com/rent/listing-123456" })],
    });
    expect(out).toHaveLength(1);
  });
});

describe("benchmarks", () => {
  it("prefers portal-published averages over batch-computed ones", () => {
    const out = transform({
      listings: [
        saleRow({
          buildingAveragePricePerSqft: 2500,
          areaAveragePricePerSqft: 2200,
        }),
      ],
    });
    expect(out[0].buildingPsf).toBe(2500);
    expect(out[0].areaPsf).toBe(2200);
    expect(out[0].benchmarkSource).toBe("Portal published");
  });

  it("computes building and area figures separately from the batch", () => {
    // Three 2-beds in one tower, plus three in another tower in the same area.
    const rows = [
      ...[1000, 1100, 1200].map((p, i) =>
        saleRow({
          priceAED: p * 1000,
          listingURL: `https://www.bayut.com/property/details-10000${i}.html`,
        }),
      ),
      ...[2000, 2100, 2200].map((p, i) =>
        saleRow({
          buildingOrTowerName: "Pricey Tower",
          priceAED: p * 1000,
          listingURL: `https://www.bayut.com/property/details-20000${i}.html`,
        }),
      ),
    ];
    const out = transform({ listings: rows });
    const cheap = out.find((l: { building: string }) => l.building === "Test Tower")!;
    // Building median comes from its own tower (1100), area median from all six.
    expect(cheap.buildingPsf).toBe(1100);
    expect(cheap.areaPsf).toBe(1600);
    expect(cheap.areaPsf).toBeGreaterThan(cheap.buildingPsf);
  });

  it("makes no claim when a group has too few comparables", () => {
    const out = transform({ listings: [saleRow()] });
    expect(out[0].buildingPsf).toBeUndefined();
    expect(out[0].areaPsf).toBeUndefined();
  });

  it("never pools bedroom bands to rescue a thin group", () => {
    // Al Tai, 2026-09-23. Nasma Residence had two 2-beds and three 3-beds, so
    // the 2-bed band was one short of a benchmark. An unbanded fallback pooled
    // all five to a median of 850 and reported the 2,365 sqft 2-bed (528/sqft)
    // as 38% below "its building's average" — it is only cheaper per foot
    // because it is bigger. That listing led the digest.
    const nasma = (beds: number, sqft: number, price: number, id: string) =>
      saleRow({
        buildingOrTowerName: "Nasma Residence",
        communityArea: "Al Tai, Sharjah",
        bedrooms: beds,
        sizeSqft: sqft,
        priceAED: price,
        listingURL: `https://www.propertyfinder.ae/en/plp/buy/townhouse-for-sale-sharjah-al-tai-nasma-residence-${id}.html`,
      });
    const out = transform({
      listings: [
        nasma(2, 1469, 1_250_000, "148621985"),
        nasma(2, 2365, 1_250_000, "147817625"),
        nasma(3, 1800, 1_530_000, "148205008"),
        nasma(3, 1800, 1_530_000, "148204991"),
        nasma(3, 2995, 2_025_000, "147800815"),
      ],
    });
    const big2Bed = out.find((l: { id: string }) => l.id === "pf-147817625")!;
    // Two in the band is one short, so there is simply no building figure.
    expect(big2Bed.buildingPsf).toBeUndefined();
    // The 3-bed band has three members and does get one — from its own band.
    const threeBed = out.find((l: { id: string }) => l.id === "pf-147800815")!;
    expect(threeBed.buildingPsf).toBe(850);
    // Whatever is published, no band ever inherits another band's median.
    for (const l of out as { beds: number; buildingPsf?: number }[]) {
      if (l.beds === 2) expect(l.buildingPsf).toBeUndefined();
    }
  });
});

describe("source links", () => {
  it("keeps a per-portal deep link so the detail page can open it", () => {
    const out = transform({ listings: [saleRow()] });
    expect(out[0].sourceUrls.Bayut).toContain("bayut.com");
  });
});
