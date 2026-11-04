// Rebuild the sweep's raw rows from the scraped *detail* pages, not the search cards.
//
//   node scripts/raw-from-detail-pages.mjs <plan.json> <detail-pages-dir> > raw.json
//
// Why this exists. The search-results scrape is a `formats: ["json"]` LLM
// extraction over a grid of cards, and on 2026-11-04 it was found to misalign
// a card's attributes with the card's own URL — sometimes for one row, and in
// Tilal City for an entire page, shifted by one. The URL is the only field that
// is self-identifying (it carries the listing id), so the search page is used
// ONLY to discover which listings exist; every value that feeds a price-per-sqft
// comes from that listing's own detail page, where it sits under a label.
//
// A silent one-row shift is the worst possible failure for this project: it
// pairs one unit's price with another's size, which is exactly the kind of
// fake "below market" psf the benchmark work exists to prevent.
//
// `plan.json` supplies only the id, url and TRACKED community (Al Menhaz is
// filed by Property Finder under "Al Ruwaidat Suburb", so the tracked label
// cannot be read off the page).
import { readFileSync, existsSync } from "node:fs";

const [planPath, dir] = process.argv.slice(2);
if (!planPath || !dir) {
  console.error("usage: raw-from-detail-pages.mjs <plan.json> <detail-pages-dir>");
  process.exit(1);
}

const EMIRATES = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Umm Al Quwain", "Fujairah"];

/** The page is a flat list of blocks: a label block followed by its value. */
const after = (blocks, label) => {
  const i = blocks.indexOf(label);
  return i >= 0 ? blocks[i + 1] : undefined;
};

const num = (s) => {
  const n = Number(String(s ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** "Studio" → 0, "1 Bed" → 1, "5 Beds + Maid" → 5. A maid's room is not a bedroom. */
const beds = (s) => (/studio/i.test(s ?? "") ? 0 : num(String(s ?? "").split("+")[0]) ?? 0);

export function parseRow(md, { id, url, community }) {
  const blocks = md.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  const titleRaw = after(blocks, "Explore");
  const price = num(blocks[blocks.indexOf(titleRaw) + 1]);
  // Firecrawl escapes the pipes agents use as separators; the app shows the title.
  const title = String(titleRaw ?? "").replace(/\\([|_*])/g, "$1");
  const sizeSqft = num(after(blocks, "Area"));
  const propertyType = after(blocks, "Property Type");
  const bedrooms = beds(after(blocks, "Bedrooms"));
  const bathrooms = num(after(blocks, "Bathrooms")) ?? 1;

  // "Melia, Masaar, Tilal City, Sharjah" — the line the map link hangs off.
  const mapIdx = blocks.indexOf("View on map");
  const path = mapIdx > 0 ? blocks[mapIdx - 1] : "";
  const parts = path.split(",").map((s) => s.trim()).filter(Boolean);
  const emirate = EMIRATES.find((e) => e.toLowerCase() === (parts.at(-1) ?? "").toLowerCase());
  const building = parts[0] || community;

  if (!price || !sizeSqft) return { id, skipped: "no price or size on the detail page" };

  return {
    id,
    title,
    building,
    // The tracked area is appended so the transform's trailing-part rule files
    // the listing under it rather than under a sub-development.
    // The path is [building, ...sub-developments, community, emirate]; keep the
    // sub-developments and swap PF's community label for the tracked area.
    community: parts.length > 3 ? `${parts.slice(1, -2).join(", ")}, ${community}` : community,
    emirate: emirate ?? "Dubai",
    propertyType,
    priceAED: price,
    bedrooms,
    bathrooms,
    sizeSqft,
    listingURL: url,
    listingType: "sale",
    portal: "Property Finder",
    description: title,
  };
}

const plan = JSON.parse(readFileSync(planPath, "utf8"));
const listings = [];
const skipped = [];
for (const p of plan) {
  const file = `${dir}/${p.id}.md`;
  if (!existsSync(file)) {
    skipped.push(`${p.id}: no detail page (withdrawn or 404)`);
    continue;
  }
  const row = parseRow(readFileSync(file, "utf8"), p);
  if (row.skipped) skipped.push(`${p.id}: ${row.skipped}`);
  else listings.push(row);
}

console.error(`Rebuilt ${listings.length} rows from detail pages; skipped ${skipped.length}.`);
for (const s of skipped) console.error(`  - ${s}`);
process.stdout.write(JSON.stringify({ listings }, null, 1));
