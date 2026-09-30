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

  it("never falls back to an unbanded median, which flags big units as cheap", () => {
    // One tower, five bedroom counts, psf falling with size exactly as it does
    // in reality. An unbanded per-building median would be drawn from all of
    // them and mark the largest unit far "below its building" purely for being
    // large. Each band here has fewer than 3 members, so the honest answer is
    // no figure at all.
    const tower = [
      saleRow({ bedrooms: 2, sizeSqft: 1_350, priceAED: 1_100_000, listingURL: "https://www.bayut.com/property/details-900001.html" }),
      saleRow({ bedrooms: 3, sizeSqft: 2_400, priceAED: 2_100_000, listingURL: "https://www.bayut.com/property/details-900002.html" }),
      saleRow({ bedrooms: 3, sizeSqft: 1_450, priceAED: 1_550_000, listingURL: "https://www.bayut.com/property/details-900003.html" }),
      saleRow({ bedrooms: 4, sizeSqft: 2_998, priceAED: 2_510_000, listingURL: "https://www.bayut.com/property/details-900004.html" }),
      saleRow({ bedrooms: 5, sizeSqft: 10_550, priceAED: 6_200_000, listingURL: "https://www.bayut.com/property/details-900005.html" }),
    ];
    const out = transform({ listings: tower });
    const biggest = out.find((l: { beds: number }) => l.beds === 5)!;
    expect(biggest.buildingPsf).toBeUndefined();
    expect(biggest.areaPsf).toBeUndefined();
    // And nothing else in the tower picked up a cross-band figure either.
    for (const l of out) expect(l.buildingPsf).toBeUndefined();
  });
});

describe("source links", () => {
  it("keeps a per-portal deep link so the detail page can open it", () => {
    const out = transform({ listings: [saleRow()] });
    expect(out[0].sourceUrls.Bayut).toContain("bayut.com");
  });
});
