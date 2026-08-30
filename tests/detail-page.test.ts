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

  it("does not match a tower whose name merely shares a common word", () => {
    // "23 Marina" is a real tower name. Stripping its leading number leaves
    // "marina", which would match most of the community — "ARY Marina View"
    // was wrongly given 23 Marina's average before this was fixed.
    const withNumberedTower = page.replace("| 2 Cayan Tower | 2,866 | 1.8% |", "| 2 23 Marina | 2,866 | 1.8% |");
    expect(parseDetailPage(withNumberedTower, { ...unit, building: "ARY Marina View" }).buildingPsf).toBeUndefined();
    expect(parseDetailPage(withNumberedTower, { ...unit, building: "23 Marina" }).buildingPsf).toBe(2866);
  });

  it("matches a sub-development named inside the listing's location path", () => {
    const parsed = parseDetailPage(page, {
      ...unit,
      building: "Noora Tower",
      locationPath: "Noora Tower, Horizon Tower, Dubai Marina",
    });
    expect(parsed.buildingPsf).toBe(1357);
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

describe("chart scope", () => {
  // Real pages read on 2026-08-30. Cayan Tower and DAMAC Heights (filed
  // straight under Dubai Marina) both reported 2,079 for 2-bed; Marina Gate 2
  // reported 3,105, which is exactly its own row in the per-location table,
  // because Bayut files it under the "Marina Gate" sub-development.
  const marinaGatePage = `
## Property Information

- PurposeFor Sale

## Trends & Indices

### Average price/sqft\*

for other 2 Beds apartments in Dubai Marina

3,1052,761Avg. price/sqftAsking Price5001,0001,5002,0002,5003,0003,500

### Popular locations\*\*

|  | Avg. price/sqft | VS Q2 2026 |
| --- | --- | --- |
| 1 Stella Maris | 2,664 | 0.1% |
| 5 Marina Gate | 3,105 | 0.6% |
`;
  const marinaGate = {
    id: "pf-16015020",
    building: "Marina Gate 2",
    community: "Dubai Marina",
    beds: 2,
    askingPrice: 3_399_000,
    sqft: 1231,
    comps: [],
  };

  it("recognises a figure that is really a sub-development's", () => {
    const parsed = parseDetailPage(marinaGatePage, marinaGate);
    expect(parsed.areaPsf).toBe(3105);
    expect(parsed.areaPsfScope).toBe("location");
    expect(parsed.areaPsfLocation).toBe("Marina Gate");
  });

  it("still treats an unmatched figure as the community's", () => {
    // Cayan Tower is filed directly under Dubai Marina, so 2,079 matches no row.
    const cayanPage = marinaGatePage
      .replace("3,1052,761", "2,0791,836")
      .replace("| 5 Marina Gate | 3,105 | 0.6% |", "| 5 Marina Gate | 3,105 | 0.6% |");
    const cayan = { ...marinaGate, id: "pf-15966507", building: "Cayan Tower", askingPrice: 2_800_000, sqft: 1525 };
    const parsed = parseDetailPage(cayanPage, cayan);
    expect(parsed.areaPsf).toBe(2079);
    expect(parsed.areaPsfScope).toBe("community");
  });

  it("never lets a sub-development's figure benchmark the whole band", () => {
    // The bug this guards: propagating 3,105 would have marked every other
    // Dubai Marina 2-bed roughly a third below market.
    const neighbour = { ...marinaGate, id: "pf-15966507", building: "Cayan Tower", areaPsf: undefined };
    const { listings } = enrich(
      [marinaGate, neighbour],
      [{ id: marinaGate.id, markdown: marinaGatePage }],
    );
    expect(listings[1].areaPsf).toBeUndefined();
    // It does still benchmark the listing that actually sits there.
    expect(listings[0].buildingPsf).toBe(3105);
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
    expect(plan.map((p: { band: string }) => p.band)).toEqual(["2", "4plus", "studio"]);
  });
});

describe("Property Finder pages", () => {
  const pfPage = readFileSync(new URL("./fixtures/propertyfinder-detail.md", import.meta.url), "utf8");
  const pfUnit = {
    id: "pf-137447722",
    building: "Barcelo Residences (Al Dar Tower)",
    community: "Dubai Marina",
    beds: 2,
    askingPrice: 2_895_000,
    sqft: 1511,
    listingType: "sale",
    benchmarkSource: "Listing averages",
    comps: [],
  };

  it("is recognised as Property Finder, not Bayut", () => {
    expect(parseDetailPage(pfPage, pfUnit).portal).toBe("propertyfinder");
    expect(parseDetailPage(page, unit).portal).toBe("bayut");
  });

  it("divides the stated average price by the stated average size", () => {
    // 2,996,887 / 1,407 = 2,130. Property Finder prints both figures in plain
    // text, so no digit-splitting is needed to recover the benchmark.
    const parsed = parseDetailPage(pfPage, pfUnit);
    expect(parsed.areaPsf).toBe(2130);
    expect(parsed.areaName).toBe("Dubai Marina");
  });

  it("treats the stated figure as the community's, never a building's", () => {
    // The page names the area it averaged, so the scope is read, not guessed.
    const parsed = parseDetailPage(pfPage, pfUnit);
    expect(parsed.areaPsfScope).toBe("community");
    expect(parsed.areaPsfLocation).toBeUndefined();
    expect(parsed.buildingPsf).toBeUndefined();
  });

  it("reads the sold table and ignores the rented one", () => {
    // Both tables are Date/amount/area; only the header separates them, and
    // Firecrawl hoists them away from their captions.
    const { transactions } = parseDetailPage(pfPage, pfUnit);
    expect(transactions.map((t) => t.price)).toEqual([1_960_000, 1_910_000, 1_400_000]);
    expect(transactions.every((t) => t.location === "Barcelo Residences (Al Dar Tower)")).toBe(true);
  });

  it("re-bands the building's sales by size, because the caption does not", () => {
    // The real 1-bed page of this tower listed its 1,095 sqft 2-bed sales
    // under a "1 Bed Apartment in …" caption, so the label cannot be trusted.
    const oneBed = { ...pfUnit, id: "pf-137444864", beds: 1, askingPrice: 1_650_000, sqft: 718 };
    const withSmallSale = pfPage.replace(
      "| 25 Feb 2026 | 1,960,000 | 1,101 |",
      "| 25 Feb 2026 | 1,960,000 | 1,101 |\n| 22 Jul 2026 | 1,150,000 | 719 |",
    );
    const { transactions } = parseDetailPage(withSmallSale, oneBed);
    expect(transactions.map((t) => t.sqft)).toEqual([719]);
  });

  it("reads sale/rent from the wording, and stays silent otherwise", () => {
    expect(parseDetailPage(pfPage, pfUnit).purpose).toBe("sale");
    expect(
      parseDetailPage(pfPage.replace("Average Sale Price is", "Average Rental Price is"), pfUnit)
        .purpose,
    ).toBe("rent");
  });

  it("benchmarks the band from a Property Finder page", () => {
    const sibling = { ...pfUnit, id: "pf-999", building: "Sanibel Tower", comps: [] };
    const { listings, stats } = enrich([pfUnit, sibling], [{ id: pfUnit.id, markdown: pfPage }]);
    expect(listings[0].areaPsf).toBe(2130);
    expect(listings[1].areaPsf).toBe(2130);
    expect(listings[0].benchmarkSource).toBe("Portal published");
    expect(stats.area).toBe(2);
    // Only the page's own listing gets that building's sales as comps.
    expect(listings[0].comps).toHaveLength(3);
    expect(listings[1].comps).toHaveLength(0);
  });

  it("prefers Property Finder's stated scope over Bayut's inferred one", () => {
    // Same community and band, both portals scraped. Bayut's chart figure has
    // to be recovered from a run-together pair and its scope inferred;
    // Property Finder states both, so it wins regardless of scrape order.
    const bayutOwner = {
      ...pfUnit,
      id: "bayut-1",
      building: "Horizon Tower",
      askingPrice: 3_000_000,
      sqft: 2450,
      comps: [],
    };
    const bayutPage = { id: "bayut-1", markdown: page };
    const pfPageEntry = { id: pfUnit.id, markdown: pfPage };

    for (const pages of [
      [bayutPage, pfPageEntry],
      [pfPageEntry, bayutPage],
    ]) {
      const { listings } = enrich([pfUnit, bayutOwner], pages);
      expect(listings.map((l: { areaPsf?: number }) => l.areaPsf)).toEqual([2130, 2130]);
    }

    // Sanity: Bayut's own figure for that band really is the different one, so
    // the assertion above is a preference and not a coincidence.
    expect(parseDetailPage(page, bayutOwner).areaPsf).toBe(2176);
  });
});

describe("pagesToScrape portal preference", () => {
  it("represents a band with a Property Finder listing when one exists", () => {
    const plan = pagesToScrape([
      { id: "b1", community: "Dubai Marina", beds: 2, sourceUrl: "https://www.bayut.com/x" },
      { id: "p1", community: "Dubai Marina", beds: 2, sourceUrls: { "Property Finder": "https://www.propertyfinder.ae/y" } },
    ]);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ id: "p1", covers: 2, isPf: true });
  });

  it("still covers a band that only Bayut lists", () => {
    const plan = pagesToScrape([
      { id: "b1", community: "JVC", beds: 1, sourceUrl: "https://www.bayut.com/x" },
    ]);
    expect(plan[0]).toMatchObject({ id: "b1", isPf: false });
  });
});
