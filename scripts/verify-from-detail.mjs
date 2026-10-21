// Rebuild each raw row's facts from its own detail page before transforming.
//
//   node scripts/verify-from-detail.mjs raw.json seed/detail-pages > raw.verified.json
//
// Why this exists (found 2026-10-21): the search-page `json` extraction attaches
// a card's fields to the WRONG listing URL often enough to matter. On the first
// nine pages checked against their own detail pages, one row was a 1-bed at
// 2.2M that is really a 4-bed penthouse at 47M; across the full sweep the price
// was wrong on 11 of 104 rows, the size on 12, the bed count on 24 and the
// title on 31. Cards that share a building slug (four "liv-lux" URLs on one
// Dubai Marina page) shuffle among themselves, and one JVC page was shifted by
// a whole position. A wrong sqft or price is a wrong AED/sqft, which is exactly
// the false "below market" flag the benchmark work exists to prevent — so the
// search page is now used only to DISCOVER urls, and every scored number comes
// off the listing's own page.
//
// Size is taken as price / PF's own "Price per area", not from the Area field.
// That is deliberate: on a villa PF prints both a plot size and a built-up
// area, and its own psf (and therefore the band average it publishes) is built
// on the plot. Dividing keeps us on whatever basis PF used, so a villa is never
// compared against the band on a different footing.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const num = (s) => (s == null ? undefined : Number(String(s).replace(/[^0-9.]/g, "")) || undefined);

/** Read the authoritative facts a Property Finder listing page states about itself. */
export function factsFromDetailPage(md) {
  const price = num(md.match(/\n([\d,]+)\n\nOwn from/)?.[1]);
  const psf = num(md.match(/Price per area\s*\n+\s*AED([\d,.]+)\/ft/)?.[1]);
  const bedRaw = md.match(/\nBedrooms\s*\n+\s*(Studio|\d+)/)?.[1];
  const baths = num(md.match(/\nBathrooms\s*\n+\s*(\d+)/)?.[1]);
  const type = md.match(/\nProperty Type\s*\n+\s*([A-Za-z]+)/)?.[1];
  // The title is the headline between the "Explore" nav crumb and the price.
  const title = md
    .match(/\nExplore\n\n([\s\S]+?)\n\n[\d,]+\n/)?.[1]
    ?.replace(/\\\|/g, "|")
    .replace(/\\_/g, "_")
    .trim();
  // "Barcelo Residences, Dubai Marina, Dubai" — the full path, tower first.
  const locationPath = md.match(/\n([^\n]+)\n\nView on map\n/)?.[1]?.trim();
  // PF states the scope of its own averages; that is the community we file under.
  const community = md.match(/live on Property Finder in ([^\n]+)/)?.[1]?.trim();

  return {
    title,
    price,
    // PF's canonical size for this listing, on the same basis as its own psf.
    sizeSqft: price && psf ? Math.round(price / psf) : undefined,
    beds: bedRaw === "Studio" ? 0 : num(bedRaw),
    baths,
    type,
    locationPath,
    community,
  };
}

const [rawFile, pagesDir] = process.argv.slice(2);
if (!rawFile || !pagesDir) {
  console.error("Usage: node scripts/verify-from-detail.mjs <raw.json> <detail-pages dir> > raw.verified.json");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(rawFile, "utf8"));
const rows = Array.isArray(raw) ? raw : (raw.listings ?? []);

const idOf = (url) => `pf-${String(url ?? "").match(/(\d{6,})/)?.[1] ?? ""}`;

const stats = { checked: 0, noPage: 0, price: 0, size: 0, beds: 0, title: 0, community: 0 };
const out = [];
for (const row of rows) {
  const id = idOf(row.listingUrl);
  const file = join(pagesDir, `${id}.md`);
  if (!existsSync(file)) {
    stats.noPage++;
    out.push(row);
    continue;
  }
  const f = factsFromDetailPage(readFileSync(file, "utf8"));
  if (!f.price || !f.sizeSqft) {
    stats.noPage++;
    out.push(row);
    continue;
  }
  stats.checked++;
  if (Math.abs(row.priceAed - f.price) / f.price > 0.02) stats.price++;
  if (Math.abs(row.sizeSqft - f.sizeSqft) / f.sizeSqft > 0.02) stats.size++;
  if (row.beds !== f.beds) stats.beds++;
  if ((row.title ?? "") !== f.title) stats.title++;
  if (f.community && row.community !== f.community) stats.community++;

  out.push({
    ...row,
    title: f.title ?? row.title,
    priceAed: f.price,
    sizeSqft: f.sizeSqft,
    beds: f.beds ?? row.beds,
    baths: f.baths ?? row.baths,
    propertyType: f.type ?? row.propertyType,
    building: f.locationPath ?? row.building,
    // The community stays the tracked area name; PF's own wording for it can
    // differ ("Jumeirah Village Circle" vs our "Jumeirah Village Circle (JVC)"),
    // and the area grouping has to stay stable across sweeps.
    community: row.community,
    // Keyword detection must read the real headline, not the card's.
    urgencyPhrases: [],
  });
}

process.stdout.write(JSON.stringify({ listings: out }, null, 2));
console.error(
  `Verified ${stats.checked} rows against their own detail pages (${stats.noPage} had none).\n` +
    `Corrected: ${stats.price} prices, ${stats.size} sizes, ${stats.beds} bed counts, ${stats.title} titles.`,
);
