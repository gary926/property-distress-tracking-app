#!/usr/bin/env node
// Pull the published benchmarks out of a portal listing *detail* page.
//
// Search pages carry no averages — the detail page does. Bayut publishes, in
// its "Trends & Indices" block, an average price/sqft for the surrounding area
// AND a per-building table, both already banded by bedroom count, plus a table
// of recent transactions in the same building. Those are asking-price averages
// computed by the portal, which is exactly the right basis: our own number is
// an asking price too, so the comparison is like for like.
//
// The scrape itself happens through Firecrawl (`formats: ["markdown"]`, 1
// credit — a JSON extraction of the same page costs 5). This file only parses,
// so it stays testable offline and cheap to run daily.
//
// The published figures are per area AND bedroom band, not per listing, so one
// page benchmarks every listing in its band. `--plan` prints the cheapest set
// of pages to scrape: 23 covered all 54 listings in the first sweep.
//
// Usage:
//   node scripts/parse-detail-page.mjs --plan listings.json      # what to scrape
//   node scripts/parse-detail-page.mjs pages/ listings.json > enriched.json
// where `pages/` is a directory of <listing id>.md files (or a JSON array of
// { id, markdown }) and listings.json is the transform's output.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Bayut prints thousands separators, and adjacent chart labels run together
 *  in the markdown ("2,1761,224" = 2,176 then 1,224). Anchoring on the comma
 *  groups is what makes that string splittable at all. */
const GROUPED_NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?/g;

function toNumber(text) {
  const n = Number(String(text).replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "19 Aug 2026" → "2026-08-19". Everything downstream stores ISO dates. */
function toIsoDate(text) {
  const m = String(text).match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month === -1) return undefined;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** Text from `heading` up to the next heading of the same or higher level. */
function section(markdown, heading) {
  const idx = markdown.indexOf(heading);
  if (idx === -1) return "";
  const level = heading.match(/^#+/)?.[0].length ?? 2;
  const rest = markdown.slice(idx + heading.length);
  const next = rest.search(new RegExp(`\\n#{1,${level}} `));
  return next === -1 ? rest : rest.slice(0, next);
}

/** Compare portal names loosely: "Silverene Tower B" vs "Silverene Tower". */
function normalise(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesBuilding(rowLabel, building) {
  const a = normalise(rowLabel).replace(/^\d+\s+/, ""); // strip the rank prefix
  const b = normalise(building);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/** "for other 4 Beds apartments in Dubai Marina" → the area average, printed
 *  next to this listing's own asking psf. Which is which is settled by
 *  comparing against the psf we already know, not by position. */
function parseAreaAverage(markdown, listingPsf) {
  const block = section(markdown, "### Average price/sqft");
  if (!block) return {};
  const chart = block.split("Avg. price/sqft")[0] ?? "";
  const areaName = block.match(/(?:apartments|villas|townhouses|properties) in ([^\n*]+)/)?.[1]?.trim();

  // The two bars are printed with nothing between them — "2,1761,224" is the
  // area average then this listing's own psf, and plenty of pairs carry no
  // comma at all ("980984"). The reliable split is to strip the psf we already
  // know off the end; what remains is the average. Anchor on the legend so the
  // bedroom count in "for other 4 Beds apartments…" cannot leak in.
  const digits = (block.match(/([\d,]+)\s*Avg\. price\/sqft/)?.[1] ?? "").replace(/,/g, "");
  if (listingPsf) {
    for (const own of [Math.round(listingPsf), Math.floor(listingPsf), Math.ceil(listingPsf)]) {
      const suffix = String(own);
      if (digits.length > suffix.length && digits.endsWith(suffix)) {
        const rest = Number(digits.slice(0, -suffix.length));
        // A benchmark orders of magnitude from the listing's own psf means the
        // split went wrong, not that the market did something extraordinary.
        if (rest > listingPsf / 20 && rest < listingPsf * 20) return { areaName, areaPsf: rest };
      }
    }
  }

  // Fallback: comma grouping is the only other thing that makes the pair
  // splittable. A lone figure is the average unless it is plainly our own psf.
  const numbers = (chart.match(GROUPED_NUMBER) ?? []).map(toNumber).filter(Boolean);
  if (numbers.length === 0) return { areaName };
  if (numbers.length === 1) {
    const only = numbers[0];
    if (listingPsf && Math.abs(only - listingPsf) / listingPsf < 0.02) return { areaName };
    return { areaName, areaPsf: Math.round(only) };
  }
  if (!listingPsf) return { areaName, areaPsf: Math.round(numbers[0]) };
  const distance = (n) => Math.abs(n - listingPsf);
  const own = numbers.reduce((best, n) => (distance(n) < distance(best) ? n : best));
  const rest = numbers.filter((n) => n !== own);
  return { areaName, areaPsf: rest.length ? Math.round(rest[0]) : undefined };
}

/** The "Popular locations" table gives an average psf per building for the
 *  same bedroom band as this listing — for several buildings, not just this
 *  one. Every row is worth keeping: the figures are published per area and
 *  bedroom band, so they apply to any listing in that band, whichever page
 *  they were read from. */
function parseBuildingAverages(markdown) {
  const block = section(markdown, "### Popular locations");
  if (!block) return [];
  const rows = [];
  for (const line of block.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4) continue;
    const [, label, psf] = cells;
    if (!label || label === "---" || label.startsWith("Avg")) continue;
    const value = toNumber((psf.match(GROUPED_NUMBER) ?? [psf])[0]);
    // Rows are ranked, so the label reads "1 Horizon Tower".
    const name = label.replace(/^\d+\s+/, "").trim();
    if (value && name) rows.push({ name, psf: Math.round(value) });
  }
  return rows;
}

/** Recent sales in the same building and bedroom band. These are settled
 *  prices, not asking prices, so they are shown as comps rather than folded
 *  into the benchmark — mixing the two bases would quietly bias every score. */
function parseTransactions(markdown, beds) {
  const block = section(markdown, "## Similar Property Transactions");
  if (!block) return [];
  const out = [];
  for (const line of block.split("\n")) {
    const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length < 3) continue;
    // Two shapes: same-building tables are Date/Area/Price, while area-wide
    // ones add a Location column naming the building each sale was in.
    const [date, ...rest] = cells;
    const iso = toIsoDate(date);
    if (!iso) continue;
    const location = rest.length >= 3 ? rest.shift() : undefined;
    const values = rest
      .map((cell) => toNumber((cell.match(GROUPED_NUMBER) ?? [cell])[0]))
      .filter((n) => n !== undefined);
    if (values.length < 2) continue;
    // Columns come in both orders (Bayut prints area then price, Property
    // Finder the reverse), so tell them apart by size rather than position: no
    // UAE unit is 50,000 sqft and none sells for AED 50,000.
    const price = Math.max(...values);
    const sqft = Math.min(...values);
    if (price < 50_000 || sqft > 50_000 || !sqft) continue;
    out.push({ date: iso, sqft, price, beds: beds ?? 0, location });
  }
  return out;
}

function parsePurpose(markdown) {
  if (/Purpose\s*For Rent/i.test(markdown)) return "rent";
  if (/Purpose\s*For Sale/i.test(markdown)) return "sale";
  return undefined;
}

/**
 * @param {string} markdown  the detail page as scraped
 * @param {{askingPrice?:number, sqft?:number, building?:string, beds?:number}} listing
 */
export function parseDetailPage(markdown, listing = {}) {
  const md = String(markdown ?? "");
  const listingPsf =
    listing.askingPrice && listing.sqft ? listing.askingPrice / listing.sqft : undefined;
  const buildingAverages = parseBuildingAverages(md);
  const mine = listing.building
    ? buildingAverages.find((r) => matchesBuilding(r.name, listing.building))
    : undefined;
  return {
    purpose: parsePurpose(md),
    ...parseAreaAverage(md, listingPsf),
    buildingAverages,
    buildingPsf: mine?.psf,
    transactions: parseTransactions(md, listing.beds),
  };
}

/** Same banding as the transform: psf is structurally lower in larger units,
 *  so a benchmark is only meaningful within a bedroom band. */
export function band(beds) {
  return beds <= 0 ? "studio" : beds >= 4 ? "4plus" : String(beds);
}

/**
 * Merge scraped detail pages into transformed listings.
 *
 * The published figures are per *area and bedroom band*, not per listing, so a
 * page scraped for one unit benchmarks every unit in the same band. That is
 * what makes this affordable: one page per (community, band) — 23 for our
 * first sweep — instead of one per listing. Transactions are the exception:
 * they are specific to the building the page belongs to.
 *
 * @returns {{listings: any[], stats: object}}
 */
export function enrich(listings, pages) {
  const byId = new Map(pages.map((p) => [p.id, p.markdown]));
  const byListingId = new Map(listings.map((l) => [l.id, l]));
  const stats = { pages: pages.length, building: 0, area: 0, comps: 0, rentals: 0, bands: 0 };

  // Pass 1 — read each page once, filed under the band it describes.
  const benchmarks = new Map(); // "community|band" -> { areaPsf, buildingAverages }
  const perListing = new Map(); // listing id -> { purpose, transactions }
  for (const page of pages) {
    const owner = byListingId.get(page.id);
    if (!owner) continue;
    const parsed = parseDetailPage(page.markdown, owner);
    perListing.set(page.id, parsed);
    const key = `${owner.community}|${band(owner.beds)}`;
    const existing = benchmarks.get(key) ?? { buildingAverages: [] };
    benchmarks.set(key, {
      areaPsf: existing.areaPsf ?? parsed.areaPsf,
      // Merge tables across pages in the same band — different pages surface
      // slightly different "popular" buildings.
      buildingAverages: [
        ...existing.buildingAverages,
        ...parsed.buildingAverages.filter(
          (r) => !existing.buildingAverages.some((e) => matchesBuilding(e.name, r.name)),
        ),
      ],
    });
  }
  stats.bands = benchmarks.size;

  // Pass 2 — apply them to every listing in the band.
  const out = [];
  for (const listing of listings) {
    const own = perListing.get(listing.id);
    // The detail page is the authoritative word on sale vs rent; a search-page
    // row that slipped past the transform's filter gets dropped here.
    if (own?.purpose === "rent") {
      stats.rentals++;
      continue;
    }
    const next = { ...listing };
    const published = benchmarks.get(`${listing.community}|${band(listing.beds)}`);
    if (published?.areaPsf) {
      next.areaPsf = published.areaPsf;
      next.benchmarkSource = "Portal published";
      stats.area++;
    }
    const match = published?.buildingAverages.find((r) => matchesBuilding(r.name, listing.building));
    if (match) {
      next.buildingPsf = match.psf;
      next.benchmarkSource = "Portal published";
      stats.building++;
    }
    if (own?.transactions.length) {
      next.comps = own.transactions.slice(0, 4).map((t) => ({
        source: "DLD",
        // Area-wide tables name the building each sale was in; same-building
        // tables do not, because every row is this listing's own tower.
        label: `${t.location ?? listing.building} · ${t.beds === 0 ? "Studio" : `${t.beds}BR`}`,
        date: t.date,
        price: t.price,
        sqft: t.sqft,
        beds: t.beds,
      }));
      stats.comps++;
    }
    out.push(next);
  }
  return { listings: out, stats };
}

/** The cheapest set of pages that benchmarks a whole batch: one listing per
 *  (community, bedroom band). Printed by `--plan` for the daily sweep. */
export function pagesToScrape(listings) {
  const seen = new Map();
  for (const l of listings) {
    const key = `${l.community}|${band(l.beds)}`;
    if (seen.has(key)) continue;
    seen.set(key, {
      id: l.id,
      url: l.sourceUrls ? Object.values(l.sourceUrls)[0] : l.sourceUrl,
      community: l.community,
      band: band(l.beds),
      covers: listings.filter((o) => `${o.community}|${band(o.beds)}` === key).length,
    });
  }
  return [...seen.values()].sort((a, b) => b.covers - a.covers);
}

const readListings = (file) => {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  return Array.isArray(raw) ? raw : (raw.listings ?? []);
};

// CLI use
if (process.argv[1] && process.argv[1].endsWith("parse-detail-page.mjs")) {
  const args = process.argv.slice(2);
  if (args[0] === "--plan") {
    if (!args[1]) {
      console.error("Usage: node scripts/parse-detail-page.mjs --plan <listings.json>");
      process.exit(1);
    }
    const plan = pagesToScrape(readListings(args[1]));
    process.stdout.write(JSON.stringify(plan, null, 2));
    console.error(
      `Scrape ${plan.length} detail pages to benchmark ${plan.reduce((n, p) => n + p.covers, 0)} listings.`,
    );
    process.exit(0);
  }
  const [pagesFile, listingsFile] = args;
  if (!pagesFile || !listingsFile) {
    console.error(
      "Usage: node scripts/parse-detail-page.mjs <pages.json> <listings.json> > enriched.json\n" +
        "       node scripts/parse-detail-page.mjs --plan <listings.json>",
    );
    process.exit(1);
  }
  // Either a directory of <listing id>.md files (what the sweep writes) or a
  // JSON array of { id, markdown }.
  let pages;
  if (statSync(pagesFile).isDirectory()) {
    pages = readdirSync(pagesFile)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({
        id: f.replace(/\.md$/, ""),
        markdown: readFileSync(join(pagesFile, f), "utf8"),
      }));
  } else {
    const pagesRaw = JSON.parse(readFileSync(pagesFile, "utf8"));
    pages = Array.isArray(pagesRaw) ? pagesRaw : (pagesRaw.pages ?? []);
  }
  const { listings: enriched, stats } = enrich(readListings(listingsFile), pages);
  process.stdout.write(JSON.stringify(enriched, null, 2));
  console.error(
    `Enriched from ${stats.pages} pages covering ${stats.bands} bands: ` +
      `${stats.building} building averages, ${stats.area} area averages, ` +
      `${stats.comps} comp sets, ${stats.rentals} rentals dropped.`,
  );
}
