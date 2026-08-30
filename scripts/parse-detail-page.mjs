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

/** Blocks of the markdown that are tables, found by their header row rather
 *  than by the heading above them.
 *
 *  Load-bearing, not a nicety: the documented Bayut scrape uses
 *  `includeTags: ["table","svg"]`, which strips every heading from the page.
 *  A parser anchored on "### Popular locations" therefore reads *nothing* from
 *  a real scrape while passing happily against a hand-trimmed transcript that
 *  kept its headings. Content anchors survive both. */
function findTable(markdown, headerMatches) {
  return (
    markdown
      .split(/\n\s*\n/)
      .find((block) => {
        const header = block.split("\n")[0] ?? "";
        return header.trim().startsWith("|") && headerMatches(header);
      }) ?? ""
  );
}

/** Prefer the named section when the page still has headings, and fall back to
 *  locating the table by its own header when it does not. */
function blockFor(markdown, heading, headerMatches) {
  return section(markdown, heading) || findTable(markdown, headerMatches);
}

/** Compare portal names loosely: "Silverene Tower B" vs "Silverene Tower". */
function normalise(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Names must line up on whole words, and the shorter one has to be specific
 *  enough to mean something. Both rules are load-bearing: the table's rank
 *  prefix is already stripped at parse time, so a tower genuinely named "23
 *  Marina" stays "23 Marina" — strip a number again and it becomes "marina",
 *  which substring-matches most of the community ("ARY Marina View" did). */
function matchesBuilding(rowLabel, building) {
  const a = normalise(rowLabel);
  const b = normalise(building);
  if (!a || !b) return false;
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const specific = shorter.includes(" ") || shorter.length >= 8;
  if (!specific) return false;
  return ` ${longer} `.includes(` ${shorter} `);
}

/** "for other 4 Beds apartments in Dubai Marina" → the area average, printed
 *  next to this listing's own asking psf. Which is which is settled by
 *  comparing against the psf we already know, not by position. */
function parseAreaAverage(markdown, listingPsf) {
  // The chart is SVG text, so it survives a scrape that strips headings; the
  // section is used only to narrow the search when headings are present.
  const block = section(markdown, "### Average price/sqft") || markdown;
  if (!/Avg\. price\/sqft/.test(block)) return {};
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
  const block = blockFor(markdown, "### Popular locations", (h) =>
    /Avg\.\s*price\/sqft/i.test(h),
  );
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
  return parseTransactionRows(
    blockFor(
      markdown,
      "## Similar Property Transactions",
      (h) => /\bDate\b/i.test(h) && /Price|AED(?!\/year)/i.test(h) && !/AED\/year/i.test(h),
    ),
    beds,
  );
}

/** Rows out of an already-isolated transactions table. Split from the lookup
 *  above because Property Finder's tables cannot be found by their heading:
 *  Firecrawl hoists every table to the top of the markdown, away from the
 *  "Transactions for Similar Properties" caption that names them. */
function parseTransactionRows(block, beds) {
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

/** Which portal a page came from. The two publish the same facts in
 *  different shapes, and no page carries both sets of markers. */
function parsePortal(markdown) {
  if (/Trends & Indices|Popular locations|Avg\. price\/sqft/i.test(markdown)) return "bayut";
  if (/Transactions for Similar Properties|Average Sale Price is|Property Finder/i.test(markdown))
    return "propertyfinder";
  return undefined;
}

/** Property Finder states its scope in words, which is what makes it the
 *  benchmark to prefer:
 *
 *    Average Sale Price is 2,996,887 AED
 *    Average size is 1,407 sqft
 *    ...average prices and sizes of all listings that were live on
 *    Property Finder in Dubai Marina
 *
 *  Dividing the two gives an asking-price psf. Two pages in the same building
 *  on 2026-08-30 proved it is banded by bedroom despite the wording: the 1-bed
 *  said 1,842,999 / 841 sqft (2,192) and the 2-bed 2,996,887 / 1,407 (2,130).
 *  So it is a community-and-band figure, named in text — no digit-splitting,
 *  and none of the sub-development ambiguity Bayut's chart carries. */
function parsePfAverages(markdown) {
  const areaName = markdown.match(/live on Property Finder in ([^\n.]+)/)?.[1]?.trim();
  const price = toNumber(markdown.match(/Average Sale Price is\s*([\d,]+)\s*AED/)?.[1]);
  const sqft = toNumber(markdown.match(/Average size is\s*([\d,]+)\s*sqft/)?.[1]);
  if (!price || !sqft) return { areaName };
  return { areaName, areaPsf: Math.round(price / sqft), areaAvgPrice: price, areaAvgSqft: sqft };
}

/** The sold table, told apart from the rented one by its header alone:
 *  Property Finder prints "AED" for sales and "AED/year" for rentals. Since
 *  the tables arrive hoisted away from their caption, the header is the only
 *  thing that identifies them. */
function parsePfSaleTable(markdown) {
  return (
    markdown
      .split(/\n\s*\n/)
      .find((block) => /^\|\s*Date\s*\|\s*AED\s*\|/im.test(block)) ?? ""
  );
}

/** "Transactions for Similar Properties / 2 Beds Apartment in Barcelo
 *  Residences (Al Dar Tower)" — the table is scoped to the building, and says
 *  so. The bedroom label is not enforced, though: the 1-bed page of that same
 *  tower listed its 1,095 sqft 2-bed sales too. So the building is taken from
 *  the caption and the band is re-applied here by size. */
function parsePfTransactionScope(markdown) {
  const m = markdown.match(
    /Transactions for Similar Properties\s*\n+\s*(?:(\d+)\s+Beds?|(Studio))[^\n]*?\sin\s+([^\n]+)/i,
  );
  if (!m) return {};
  return { beds: m[2] ? 0 : Number(m[1]), building: m[3].trim() };
}

function parsePfDetailPage(markdown, listing) {
  const scope = parsePfTransactionScope(markdown);
  const rows = parseTransactionRows(parsePfSaleTable(markdown), listing.beds ?? scope.beds);
  // Same building but any size, so keep only what is genuinely comparable.
  // Without this a 719 sqft sale would be shown as a comp for a 1,511 sqft unit.
  const comparable = listing.sqft
    ? rows.filter((t) => Math.abs(t.sqft - listing.sqft) / listing.sqft <= 0.35)
    : rows;
  return {
    portal: "propertyfinder",
    purpose: parsePfPurpose(markdown),
    ...parsePfAverages(markdown),
    // The scope is stated on the page, so it never needs inferring.
    areaPsfScope: parsePfAverages(markdown).areaPsf ? "community" : undefined,
    areaPsfLocation: undefined,
    // Property Finder publishes no per-building asking average — only settled
    // sales, which stay out of the benchmark and are shown as comps instead.
    buildingAverages: [],
    buildingPsf: undefined,
    transactions: comparable.map((t) => ({ ...t, location: scope.building })),
  };
}

/** Conservative: only the two phrasings that state it outright. Anything else
 *  leaves the verdict unset, and the transform's own filter stands. */
function parsePfPurpose(markdown) {
  if (/Average Rent(?:al)? Price is/i.test(markdown)) return "rent";
  if (/Average Sale Price is/i.test(markdown)) return "sale";
  return undefined;
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
  if (parsePortal(md) === "propertyfinder") return parsePfDetailPage(md, listing);
  const listingPsf =
    listing.askingPrice && listing.sqft ? listing.askingPrice / listing.sqft : undefined;
  const buildingAverages = parseBuildingAverages(md);
  const forListing = listing.locationPath ?? listing.building;
  const mine = forListing
    ? buildingAverages.find((r) => matchesBuilding(r.name, forListing))
    : undefined;
  const area = parseAreaAverage(md, listingPsf);

  // The chart's label always names the community, but the figure is scoped to
  // whatever location Bayut filed the listing under — which for a unit in a
  // sub-development is that sub-development, not the community. Two Dubai
  // Marina 2-bed pages read on the same day proved it: Cayan Tower and DAMAC
  // Heights both said 2,079, while Marina Gate 2 said 3,105 — exactly its own
  // row in the per-location table below. Treating that as the Dubai Marina
  // average would have marked every other 2-bed in the community ~33% below
  // market. When the figure coincides with a named location, assume it is that
  // location's, and let it benchmark only listings that sit there.
  const scopedTo = area.areaPsf
    ? buildingAverages.find((r) => r.psf === area.areaPsf)?.name
    : undefined;

  return {
    portal: parsePortal(md),
    purpose: parsePurpose(md),
    ...area,
    areaPsfScope: area.areaPsf ? (scopedTo ? "location" : "community") : undefined,
    areaPsfLocation: scopedTo,
    buildingAverages,
    buildingPsf: mine?.psf,
    transactions: parseTransactions(md, listing.beds),
  };
}

function median(values) {
  if (values.length === 0) return undefined;
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

/**
 * The band's area average, decided by vote rather than by whichever page was
 * read first.
 *
 * With one page per band there is nothing to compare, so a figure scoped to a
 * sub-development is caught only when it happens to coincide with a row in the
 * per-location table. Scraping every listing turns that into a majority: seven
 * Dubai Marina 2-bed pages saying 2,130 outvote the one saying 3,105.
 *
 * Property Finder still wins outright where it is present — it states the
 * community it averaged, so it needs no corroboration — and only its figures
 * are polled when any exist.
 */
export function consensusArea(candidates) {
  const community = candidates.filter((c) => c.scope === "community" && c.psf > 0);
  if (community.length === 0) return {};
  const pf = community.filter((c) => c.portal === "propertyfinder");
  const polled = pf.length > 0 ? pf : community;
  const values = polled.map((c) => c.psf);
  const psf = median(values);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return {
    areaPsf: psf,
    areaPsfPortal: polled[0].portal,
    votes: polled.length,
    // Pages in one band should agree. When they do not, something is scoped
    // differently from what it claims and the median is load-bearing.
    spreadPct: lo > 0 ? Math.round(((hi - lo) / lo) * 100) : 0,
  };
}

/**
 * A per-building AED/sqft from the building's own recorded sales.
 *
 * Deliberately NOT written to `buildingPsf`: these are settled prices and the
 * listing is an asking price, so the two cannot share a field without biasing
 * every score. It travels separately, labelled, as the evidence it is.
 */
export function transactionPsf(transactions, sqft) {
  const rows = sqft
    ? transactions.filter((t) => t.sqft > 0 && Math.abs(t.sqft - sqft) / sqft <= 0.35)
    : transactions.filter((t) => t.sqft > 0);
  if (rows.length === 0) return {};
  return {
    buildingTxnPsf: Math.round(median(rows.map((t) => t.price / t.sqft))),
    buildingTxnCount: rows.length,
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
  const stats = {
    pages: pages.length,
    building: 0,
    area: 0,
    comps: 0,
    rentals: 0,
    bands: 0,
    txnPsf: 0,
    /** Bands whose pages disagreed by more than 15% — worth a look before
     *  ingesting, because it means something is scoped differently from what
     *  it says. Only ever populated when several pages cover one band. */
    disputed: [],
  };

  // Pass 1 — read each page once, filed under the band it describes.
  const benchmarks = new Map(); // "community|band" -> { candidates, buildingAverages }
  const perListing = new Map(); // listing id -> { purpose, transactions }
  for (const page of pages) {
    const owner = byListingId.get(page.id);
    if (!owner) continue;
    const parsed = parseDetailPage(page.markdown, owner);
    perListing.set(page.id, parsed);
    const key = `${owner.community}|${band(owner.beds)}`;
    const existing = benchmarks.get(key) ?? { candidates: [], buildingAverages: [] };
    benchmarks.set(key, {
      // Every page's reading is a vote, resolved once all pages are in. A
      // figure scoped to a sub-development is still recorded, but as its own
      // scope, so it can only reach the listings that actually sit there.
      candidates: [
        ...existing.candidates,
        ...(parsed.areaPsf
          ? [{ psf: parsed.areaPsf, scope: parsed.areaPsfScope, portal: parsed.portal }]
          : []),
      ],
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

  // Resolve each band's vote before applying anything.
  const resolved = new Map();
  for (const [key, entry] of benchmarks) {
    const vote = consensusArea(entry.candidates);
    resolved.set(key, { ...vote, buildingAverages: entry.buildingAverages });
    if (vote.spreadPct > 15) {
      stats.disputed.push({ band: key, spreadPct: vote.spreadPct, votes: vote.votes });
    }
  }

  stats.bands = resolved.size;

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
    const published = resolved.get(`${listing.community}|${band(listing.beds)}`);
    if (published?.areaPsf) {
      next.areaPsf = published.areaPsf;
      next.benchmarkSource = "Portal published";
      stats.area++;
    }
    const match = published?.buildingAverages?.find((r) =>
      matchesBuilding(r.name, listing.locationPath ?? listing.building),
    );
    if (match) {
      next.buildingPsf = match.psf;
      next.buildingPsfLabel = match.name;
      next.benchmarkSource = "Portal published";
      stats.building++;
    }
    if (own?.transactions.length) {
      // A settled-price figure for this listing's own building. Kept apart
      // from buildingPsf, which is an asking-price average — folding the two
      // together would compare an asking price against what people actually
      // paid and read the gap as a great deal.
      const txn = transactionPsf(own.transactions, listing.sqft);
      if (txn.buildingTxnPsf) {
        next.buildingTxnPsf = txn.buildingTxnPsf;
        next.buildingTxnCount = txn.buildingTxnCount;
        stats.txnPsf++;
      }
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
const pfUrl = (l) => l.sourceUrls?.["Property Finder"] ?? (/propertyfinder/.test(l.sourceUrl ?? "") ? l.sourceUrl : undefined);
const anyUrl = (l) => pfUrl(l) ?? (l.sourceUrls ? Object.values(l.sourceUrls)[0] : l.sourceUrl);

/**
 * What to scrape. Two modes, and the choice is a budget decision:
 *
 * - **band** (default): one page per (community, bedroom band). The published
 *   averages are per band, so this benchmarks everything for ~10 pages. What
 *   it cannot give you is anything specific to a listing — its own tower's
 *   sales — because those pages are never fetched.
 * - **perListing**: every listing's own page. Roughly one credit per listing,
 *   and in exchange every listing gets its own building's transactions, and
 *   the band's area average becomes a vote across many pages rather than a
 *   reading from one (see `consensusArea`).
 */
export function pagesToScrape(listings, { perListing = false } = {}) {
  if (perListing) {
    return listings
      .filter((l) => anyUrl(l))
      .map((l) => ({
        id: l.id,
        url: anyUrl(l),
        isPf: Boolean(pfUrl(l)),
        community: l.community,
        band: band(l.beds),
        covers: 1,
      }));
  }
  const seen = new Map();
  for (const l of listings) {
    const key = `${l.community}|${band(l.beds)}`;
    // One page per band, but not just any page: a Property Finder listing
    // states the scope of its average in words, where Bayut's has to be
    // inferred and is sometimes a sub-development's. Same cost, better figure.
    const existing = seen.get(key);
    if (existing && !(pfUrl(l) && !existing.isPf)) continue;
    seen.set(key, {
      id: l.id,
      url: anyUrl(l),
      isPf: Boolean(pfUrl(l)),
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
    const perListing = args.includes("--per-listing");
    const file = args.slice(1).find((a) => !a.startsWith("--"));
    if (!file) {
      console.error(
        "Usage: node scripts/parse-detail-page.mjs --plan [--per-listing] <listings.json>",
      );
      process.exit(1);
    }
    const listings = readListings(file);
    const plan = pagesToScrape(listings, { perListing });
    process.stdout.write(JSON.stringify(plan, null, 2));
    const band = pagesToScrape(listings).length;
    console.error(
      perListing
        ? `Scrape ${plan.length} detail pages — one per listing (${plan.length - band} more than the ${band}-page band plan).\n` +
            `Buys: every listing's own building sales, and the band average decided by vote instead of one reading.`
        : `Scrape ${plan.length} detail pages to benchmark ${plan.reduce((n, p) => n + p.covers, 0)} listings.\n` +
            `Add --per-listing for per-building data at ~1 credit per listing.`,
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
      `${stats.txnPsf} building sale figures, ${stats.comps} comp sets, ` +
      `${stats.rentals} rentals dropped.`,
  );
  for (const d of stats.disputed) {
    console.error(
      `  ! ${d.band}: ${d.votes} pages disagree by ${d.spreadPct}% — the median was taken, ` +
        `but check one page before trusting this band.`,
    );
  }
}
