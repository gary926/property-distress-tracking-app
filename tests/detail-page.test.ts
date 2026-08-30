import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error - plain .mjs helper shared with the sweep pipeline
import { enrich, pagesToScrape, parseDetailPage } from "../scripts/parse-detail-page.mjs";

const page = readFileSync(new URL("./fixtures/bayut-detail.md", import.meta.url), "utf8");
const unit = { askingPrice: 3_000_000, sqft: 2450, building: "Horizon Tower", beds: 4 };

describe("parseDetailPage", () => {
  it("reads the published area average, not this listing's own psf", () => {
    // The chart prints both figures run together ("2,1761,224"): 2,176 is the
    // Dubai Marina average, 1,224 is this unit (3,000,000 / 2,450).
    const parsed = parseDetailPage(page, unit);
    expect(parsed.areaPsf).toBe(2176);
    expect(parsed.areaName).toBe("Dubai Marina");
  });

  it("reads the building average out of the per-tower table", () => {
    expect(parseDetailPage(page, unit).buildingPsf).toBe(1357);
  });

  it("matches the building loosely enough for portal name drift", () => {
    // Search pages say "Horizon Tower A"; the trends table says "Horizon Tower".
    expect(parseDetailPage(page, { ...unit, building: "Horizon Tower A" }).buildingPsf).toBe(1357);
    expect(parseDetailPage(page, { ...unit, building: "Cayan Tower" }).buildingPsf).toBe(2866);
    expect(parseDetailPage(page, { ...unit, building: "Nowhere Tower" }).buildingPsf).toBeUndefined();
  });

  it("reads same-building transactions as ISO-dated comps", () => {
    const { transactions } = parseDetailPage(page, unit);
    expect(transactions).toHaveLength(6);
    expect(transactions[0]).toEqual({ date: "2026-08-19", sqft: 2409, price: 3_200_000, beds: 4 });
  });

  it("reports the page's own sale/rent verdict", () => {
    expect(parseDetailPage(page, unit).purpose).toBe("sale");
    expect(parseDetailPage(page.replace("PurposeFor Sale", "PurposeFor Rent"), unit).purpose).toBe(
      "rent",
    );
  });

  it("reads transaction columns in either order", () => {
    // Property Finder prints Date | AED | Area; Bayut prints Date | Area | AED.
    const swapped = page
      .replace("| Date | Area (sqft) | Price |", "| Date | AED | Area (sqft) |")
      .replace("| 19 Aug 2026 | 2,409 | AED 3,200,000 |", "| 19 Aug 2026 | 3,200,000 | 2,409 |");
    const { transactions } = parseDetailPage(swapped, unit);
    expect(transactions[0]).toMatchObject({ sqft: 2409, price: 3_200_000 });
  });

  it("returns nothing rather than guessing on a page with no trends block", () => {
    const parsed = parseDetailPage("# Some other page\n\nNothing useful here.", unit);
    expect(parsed.areaPsf).toBeUndefined();
    expect(parsed.buildingPsf).toBeUndefined();
    expect(parsed.transactions).toEqual([]);
  });
});

describe("enrich", () => {
  const listing = {
    id: "pf-14066052",
    ...unit,
    community: "Dubai Marina",
    listingType: "sale",
    areaPsf: 1500, // computed from the batch — the published figure should win
    benchmarkSource: "Listing averages",
    comps: [],
  };
  const pages = [{ id: listing.id, markdown: page }];

  it("overwrites computed benchmarks with the portal's published ones", () => {
    const { listings, stats } = enrich([listing], pages);
    expect(listings[0].buildingPsf).toBe(1357);
    expect(listings[0].areaPsf).toBe(2176);
    expect(listings[0].benchmarkSource).toBe("Portal published");
    expect(stats.building).toBe(1);
    expect(stats.area).toBe(1);
  });

  it("benchmarks the whole bedroom band from one scraped page", () => {
    // This is what keeps the sweep affordable: the page's figures are
    // published per area and bedroom band, so a 4-bed page in Dubai Marina
    // benchmarks every 4-bed in Dubai Marina, scraped or not.
    const sibling = {
      ...listing,
      id: "pf-999",
      building: "Cayan Tower",
      askingPrice: 5_000_000,
      areaPsf: undefined,
      benchmarkSource: "Listing averages",
    };
    const { listings, stats } = enrich([listing, sibling], pages);
    expect(listings[1].areaPsf).toBe(2176);
    expect(listings[1].buildingPsf).toBe(2866); // its own row in the table
    expect(stats.pages).toBe(1);
    expect(stats.area).toBe(2);
  });

  it("does not apply a band's figures to a different band or community", () => {
    const other = { ...listing, id: "pf-2br", beds: 2, areaPsf: undefined };
    const elsewhere = { ...listing, id: "pf-jvc", community: "JVC", areaPsf: undefined };
    const { listings } = enrich([listing, other, elsewhere], pages);
    expect(listings[1].areaPsf).toBeUndefined();
    expect(listings[2].areaPsf).toBeUndefined();
  });

  it("attaches transactions as DLD comps, only to the page's own listing", () => {
    const sibling = { ...listing, id: "pf-999", building: "Cayan Tower", comps: [] };
    const { listings } = enrich([listing, sibling], pages);
    expect(listings[0].comps).toHaveLength(4);
    expect(listings[0].comps[0].source).toBe("DLD");
    expect(listings[1].comps).toHaveLength(0);
  });

  it("drops a listing the detail page reveals to be a rental", () => {
    const { listings, stats } = enrich(
      [listing],
      [{ id: listing.id, markdown: page.replace("PurposeFor Sale", "PurposeFor Rent") }],
    );
    expect(listings).toHaveLength(0);
    expect(stats.rentals).toBe(1);
  });

  it("leaves listings with no scraped page untouched", () => {
    const { listings } = enrich([listing], []);
    expect(listings[0].areaPsf).toBe(1500);
    expect(listings[0].benchmarkSource).toBe("Listing averages");
  });
});

describe("pagesToScrape", () => {
  it("picks one listing per area and bedroom band, busiest band first", () => {
    const l = (id: string, community: string, beds: number) => ({ id, community, beds, sourceUrl: `u/${id}` });
    const plan = pagesToScrape([
      l("a", "Dubai Marina", 2),
      l("b", "Dubai Marina", 2),
      l("c", "Dubai Marina", 4),
      l("d", "JVC", 0),
    ]);
    expect(plan).toHaveLength(3);
    expect(plan[0]).toMatchObject({ id: "a", community: "Dubai Marina", band: "2", covers: 2 });
    expect(plan.map((p) => p.band)).toEqual(["2", "4plus", "studio"]);
  });
});
