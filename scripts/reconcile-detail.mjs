#!/usr/bin/env node
// Correct a transformed batch against each listing's own detail page.
//
//   node scripts/reconcile-detail.mjs seed/detail-pages listings.json > listings.json.new
//
// Why this exists. The search-page scrape is a `formats: ["json"]` extraction
// over a long, noisy results page, and the extraction model pairs fields across
// adjacent cards. On the 2026-09-30 sweep the Sharjah Garden City page came back
// shifted by one card — most rows carried a neighbour's price and size — and
// single rows in Al Khan, Al Tai and Business Bay were wrong the same way
// (Ubora Tower 1 was extracted as 590 sqft / AED 1,150,000 against a real
// 1,586 sqft / AED 2,700,000).
//
// That is not a cosmetic error: askingPrice/sqft ARE the below-market signal,
// so a mis-paired row manufactures a bargain that does not exist, and the
// digest would put it in front of a person as the day's top deal.
//
// The listing's own detail page states all of it unambiguously, and the
// per-listing enrichment already fetches one page per listing, so the fix is
// free: believe the detail page, and say which rows moved. A listing whose page
// 404s has been delisted since the search scrape and is dropped.
//
// This runs BEFORE parse-detail-page.mjs, so the benchmarks are matched against
// corrected beds (the band) and the scorer sees the real psf.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const num = (s) => {
  const n = Number(String(s).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** The facts a Property Finder detail page states about its own listing.
 *  Anchored on the "Property details" labels rather than on position, because
 *  the scrape recipe strips headings and the surrounding blocks move around. */
export function parseOwnFacts(markdown) {
  const out = {};

  // "Area\n\n966 ft²" — the unit's own size, not a comparable's.
  const area = markdown.match(/\bArea\n+([\d,]+) ft²/);
  if (area) out.sqft = num(area[1]);

  // "1,850,000\n\nOwn from  7,609/month" — the asking price always precedes
  // the mortgage teaser, which no comparable block carries.
  const price = markdown.match(/([\d,]+)\n+Own from\s+[\d,]+\/month/);
  if (price) out.askingPrice = num(price[1]);

  // "Bedrooms\n\nStudio" / "2 Beds + Maid" / "1 Bed"
  const beds = markdown.match(/\bBedrooms\n+(Studio|\d+)\s*(?:Beds?)?/i);
  if (beds) out.beds = /studio/i.test(beds[1]) ? 0 : Number(beds[1]);

  // "Bathrooms\n\n7+ Baths"
  const baths = markdown.match(/\bBathrooms\n+(\d+)\+?\s*Baths?/i);
  if (baths) out.baths = Number(baths[1]);

  // "Property Type\n\nVilla". PF sometimes mislabels the field (a villa filed
  // as Apartment), so the title and URL get a say too — see reconcile().
  const type = markdown.match(/\bProperty Type\n+([A-Za-z]+)/);
  if (type) out.type = type[1];

  // The headline sits between the mortgage-CTA boilerplate and the price.
  const title = markdown.match(/End-to-end support, free\.\n+([^\n]+)\n+[\d,]+\n/);
  if (title) out.title = title[1].replace(/\\\|/g, "|").trim();

  // "Price per area\n\nAED1,915/ft²" — used only to check our own division.
  const psf = markdown.match(/Price per area\n+AED\s*([\d,]+)\/ft²/);
  if (psf) out.statedPsf = num(psf[1]);

  return out;
}

const TYPES = ["Penthouse", "Townhouse", "Villa", "Duplex", "Apartment"];
/** Prefer what the URL slug and title agree on; PF's own Property Type field
 *  is wrong often enough that it only breaks ties. */
function resolveType(facts, listing) {
  const url = String(listing.sourceUrl ?? "").toLowerCase();
  for (const t of TYPES) {
    if (url.includes(`/${t.toLowerCase()}-for-sale-`)) return t;
  }
  const hay = `${facts.title ?? ""}`.toLowerCase();
  for (const t of TYPES) if (hay.includes(t.toLowerCase())) return t;
  const fromField = TYPES.find((t) => t.toLowerCase() === String(facts.type ?? "").toLowerCase());
  return fromField ?? listing.type;
}

export function reconcile(listings, pagesDir) {
  const changes = [];
  const dropped = [];
  const out = [];

  for (const listing of listings) {
    const file = join(pagesDir, `${listing.id}.md`);
    if (!existsSync(file)) {
      // No page for this listing: it 404'd during enrichment, i.e. it was
      // delisted between the search scrape and now. Publishing it would show a
      // deal that can no longer be bought.
      dropped.push({ id: listing.id, building: listing.building, reason: "no detail page (delisted)" });
      continue;
    }
    const facts = parseOwnFacts(readFileSync(file, "utf8"));
    const next = { ...listing };
    const diff = [];

    for (const key of ["askingPrice", "sqft", "beds", "baths"]) {
      const v = facts[key];
      if (v === undefined) continue;
      // beds/baths of 0 are meaningful (studio), so compare against undefined.
      if (next[key] !== v) {
        diff.push(`${key} ${next[key]} → ${v}`);
        next[key] = v;
      }
    }
    if (facts.title && facts.title !== next.title) {
      diff.push("title");
      next.title = facts.title;
      next.description = facts.title;
    }
    const type = resolveType(facts, listing);
    if (type && type !== next.type) {
      diff.push(`type ${next.type} → ${type}`);
      next.type = type;
    }

    // Sanity check our own arithmetic against the portal's stated psf. A gap
    // here means one of the two numbers we just trusted is still wrong, so say
    // so rather than let it through quietly.
    if (facts.statedPsf && next.sqft) {
      const ours = next.askingPrice / next.sqft;
      const gap = Math.abs(ours - facts.statedPsf) / facts.statedPsf;
      if (gap > 0.02) {
        diff.push(`WARN psf ${Math.round(ours)} vs portal ${facts.statedPsf}`);
      }
    }

    if (diff.length) changes.push({ id: listing.id, building: listing.building, diff });
    out.push(next);
  }

  return { listings: out, changes, dropped };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [dir, listingsPath] = process.argv.slice(2);
  if (!dir || !listingsPath) {
    process.stderr.write("Usage: node scripts/reconcile-detail.mjs <pagesDir> <listings.json>\n");
    process.exit(1);
  }
  const listings = JSON.parse(readFileSync(listingsPath, "utf8"));
  const { listings: fixed, changes, dropped } = reconcile(listings, dir);
  process.stdout.write(JSON.stringify(fixed, null, 1));
  process.stderr.write(
    `Reconciled ${fixed.length} listings against their detail pages.\n` +
      `  corrected: ${changes.length}\n` +
      `  dropped:   ${dropped.length}\n` +
      changes.map((c) => `    ${c.id} ${c.building}: ${c.diff.join("; ")}\n`).join("") +
      dropped.map((d) => `    DROP ${d.id} ${d.building}: ${d.reason}\n`).join(""),
  );
}
