#!/usr/bin/env node
// Build the sweep's raw batch from the *detail* pages, not the search cards.
//
//   node scripts/raw-from-detail-pages.mjs seed/detail-pages/<date> urls.json > raw.json
//
// Why this exists (found 2026-10-14, the first PF-only sweep): the search-page
// `formats: ["json"]` extraction binds card fields to the wrong listing URL
// often enough to be unusable. Measured against the detail pages on that run,
// 11 of 82 rows disagreed — a wrong price, a wrong size, a studio recorded as a
// 1-bed, and in Tilal City the whole page shifted by one so every card carried
// its neighbour's data. Those errors are silent and they land straight in the
// AED/sqft the below-market signal divides by.
//
// The detail page states the same fields unambiguously, in a "Property details"
// block, and we already fetch one per listing for the benchmarks. So the search
// page's only job is to hand us candidate URLs (which it gets right — they are
// hrefs, not inferred), and every scored number comes from the listing's own
// page.
//
// `urls.json` maps id -> listing URL, in the shape the transform wants back.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [pagesDir, urlsFile] = process.argv.slice(2);
if (!pagesDir || !urlsFile) {
  console.error("usage: raw-from-detail-pages.mjs <pages dir> <urls.json>");
  process.exit(1);
}

const urls = JSON.parse(readFileSync(urlsFile, "utf8"));
const num = (s) => {
  const n = Number(String(s).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** The value PF prints under a "Property details" label, e.g.
 *  "Bedrooms\n\n3 Beds + Maid" → "3 Beds + Maid". */
function field(md, label) {
  const m = md.match(new RegExp(`\\n${label}\\n\\n([^\\n]+)`));
  return m ? m[1].trim() : undefined;
}

/** "3 Beds + Maid" → 3, "Studio" / "Studio + Maid" → 0. */
function beds(md) {
  const raw = field(md, "Bedrooms");
  if (!raw) return undefined;
  if (/studio/i.test(raw)) return 0;
  const n = raw.match(/(\d+)/);
  return n ? Number(n[1]) : undefined;
}

/** The listing's own headline: the first line after the "Explore" nav crumb. */
function title(md) {
  const after = md.split(/\nExplore\n/)[1];
  if (!after) return undefined;
  const line = after.split("\n").map((l) => l.trim()).find(Boolean);
  // Firecrawl escapes the pipes agents use as separators.
  return line ? line.replace(/\\\|/g, "|").replace(/\\\*/g, "*").trim() : undefined;
}

/** "Laura, Masaar 3, Al Ruwaidat Suburb, Sharjah" — the line above the map
 *  link. Its head is the tower, its tail the community PF scopes averages to,
 *  which is why the whole path is handed to the transform. */
function locationPath(md) {
  const m = md.match(/\n([^\n]+,[^\n]+)\n\nView on map/);
  if (m) return m[1].trim();
  // A few pages omit the map link; fall back to the scope sentence's area.
  const scope = md.match(/live on Property Finder in ([^\n]+)\n\n([^\n]+,[^\n]+)\n/);
  return scope ? scope[2].trim() : undefined;
}

const rows = [];
const skipped = [];
for (const file of readdirSync(pagesDir).filter((f) => f.endsWith(".md")).sort()) {
  const id = file.replace(/\.md$/, "");
  const md = "\n" + readFileSync(join(pagesDir, file), "utf8");

  const type = field(md, "Property Type");
  // Plots are not scored. A plot's AED/sqft is land, the area average PF
  // publishes is built homes, and dividing one by the other reads a 2,800 sqft
  // plot at 160/sqft as ~80% below a 674/sqft neighbourhood. v1 compares like
  // with like or not at all.
  if (!type || /^land$/i.test(type)) {
    skipped.push(`${id} (${type ?? "no type"})`);
    continue;
  }

  const sqft = num((field(md, "Area") ?? "").replace(/\s*ft².*/, ""));
  const psf = num((field(md, "Price per area") ?? "").replace(/^AED/, "").replace(/\/ft².*/, ""));
  const b = beds(md);
  const t = title(md);
  const path = locationPath(md);
  // The headline price is printed twice, right under the title; take the first
  // grouped number that squares with sqft × psf so a stray figure can't win.
  const head = (md.split(/\nExplore\n/)[1] ?? "").slice(0, 600);
  const candidates = [...head.matchAll(/\d{1,3}(?:,\d{3})+/g)].map((m) => num(m[0]));
  const expected = sqft && psf ? sqft * psf : undefined;
  const price = expected
    ? candidates.find((c) => c && Math.abs(c - expected) / expected < 0.02) ?? candidates[0]
    : candidates[0];

  if (!price || !sqft || b === undefined || !t || !path) {
    skipped.push(`${id} (incomplete: price=${price} sqft=${sqft} beds=${b})`);
    continue;
  }

  rows.push({
    listingURL: urls[id],
    title: t,
    building: path.split(",")[0].trim(),
    community: path,
    priceAED: price,
    sizeSqft: sqft,
    bedrooms: b,
    bathrooms: num((field(md, "Bathrooms") ?? "").replace(/\+?\s*Baths?.*/, "")) ?? 1,
    propertyType: type,
    listingType: "sale",
    portal: "Property Finder",
    description: t,
  });
}

console.error(`Built ${rows.length} rows from ${pagesDir}.`);
if (skipped.length) console.error(`Skipped ${skipped.length}: ${skipped.join(", ")}`);
process.stdout.write(JSON.stringify({ listings: rows }, null, 1));
