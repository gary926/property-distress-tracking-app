// Turn raw Firecrawl extractions into the `Listing` shape the app ingests.
//
//   node scripts/transform-listings.mjs raw.json > listings.json
//
// Raw input: {"listings":[...]} or [...], with loosely-named fields (the
// extraction prompt varies per portal). Field lookup is therefore fuzzy.
// Benchmarks: per-building average AED/sqft when a building has 3+ listings,
// otherwise the community average — computed from the batch itself, which is
// what makes the below-market signal work on the very first sweep.
import { readFileSync } from "node:fs";

const DISTRESS_KEYWORDS = [
  "urgent sale",
  "urgent",
  "distress",
  "motivated seller",
  "below original price",
  "below market",
  "reduced price",
  "price reduced",
  "reduced",
  "mortgage settlement",
  "leaving country",
  "bank foreclosure",
  "auction",
  "quick sale",
  "must sell",
];

const pick = (obj, ...names) => {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const entries = Object.entries(obj).map(([k, v]) => [norm(k), v]);
  for (const name of names) {
    const hit = entries.find(([k]) => k === norm(name));
    if (hit && hit[1] !== undefined && hit[1] !== null && hit[1] !== "") return hit[1];
  }
  for (const name of names) {
    const hit = entries.find(([k]) => k.includes(norm(name)));
    if (hit && hit[1] !== undefined && hit[1] !== null && hit[1] !== "") return hit[1];
  }
  return undefined;
};

const num = (v) => {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return undefined;
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

function slugId(url, title, building) {
  const fromUrl = String(url ?? "").match(/(\d{6,})/)?.[1];
  if (fromUrl) return `pf-${fromUrl}`;
  const base = `${building ?? ""}-${title ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return base || `listing-${Math.random().toString(36).slice(2, 10)}`;
}

function inferType(raw, title, beds) {
  const t = String(pick(raw, "propertyType", "type") ?? "").toLowerCase();
  const hay = `${t} ${title ?? ""}`.toLowerCase();
  if (hay.includes("penthouse")) return "Penthouse";
  if (hay.includes("townhouse")) return "Townhouse";
  if (hay.includes("villa")) return "Villa";
  return "Apartment";
}

function inferEmirate(raw, community) {
  const explicit = String(pick(raw, "emirate") ?? "");
  const hay = `${explicit} ${community ?? ""}`.toLowerCase();
  if (hay.includes("abu dhabi") || /reem|yas|raha|saadiyat|khalifa city/.test(hay)) return "Abu Dhabi";
  if (hay.includes("sharjah") || /aljada|al khan|muwaileh/.test(hay)) return "Sharjah";
  if (hay.includes("ajman")) return "Ajman";
  if (hay.includes("ras al khaimah") || /al hamra|al marjan/.test(hay)) return "Ras Al Khaimah";
  if (hay.includes("umm al quwain")) return "Umm Al Quwain";
  if (hay.includes("fujairah")) return "Fujairah";
  return "Dubai";
}

function findKeywords(...texts) {
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  const found = DISTRESS_KEYWORDS.filter((k) => hay.includes(k));
  // Keep the most specific match when phrases overlap ("urgent sale" ⊃ "urgent").
  return found.filter((k) => !found.some((o) => o !== k && o.includes(k)));
}

export function transform(rawInput, { source = "firecrawl" } = {}) {
  const rows = Array.isArray(rawInput) ? rawInput : (rawInput.listings ?? []);
  const today = new Date().toISOString().slice(0, 10);

  const interim = rows
    .map((raw) => {
      const title = String(pick(raw, "title", "name") ?? "").trim();
      const price = num(pick(raw, "priceAED", "price"));
      const sqft = num(pick(raw, "sizeSqft", "size", "area", "builtUpArea"));
      if (!price || !sqft) return null;

      const rawCommunity = String(pick(raw, "communityArea", "community", "area", "location") ?? "").trim();
      // "Marina Gate, Dubai Marina" → community is the broader trailing part.
      const parts = rawCommunity.split(",").map((s) => s.trim()).filter(Boolean);
      const community = parts[parts.length - 1] || "Unknown";
      const building = String(pick(raw, "buildingTowerName", "building", "tower") ?? parts[0] ?? community).trim();
      const url = pick(raw, "listingURL", "url", "link");
      const description = String(pick(raw, "description", "summary") ?? "").trim();
      const bedsRaw = pick(raw, "bedrooms", "beds");
      const beds = typeof bedsRaw === "number" ? bedsRaw : (num(bedsRaw) ?? 0);

      return {
        id: slugId(url, title, building),
        title: title || `${beds || "Studio"} in ${building}`,
        building,
        community,
        emirate: inferEmirate(raw, rawCommunity),
        type: inferType(raw, title, beds),
        beds,
        baths: num(pick(raw, "bathrooms", "baths")) ?? 1,
        sqft,
        askingPrice: price,
        benchmarkPsf: 0, // filled in below
        benchmarkSource: "Listing averages",
        listedDate: today,
        relistCount: 0,
        keywords: findKeywords(title, description, JSON.stringify(pick(raw, "urgencyPhrases") ?? "")),
        description: description || title,
        portals: [String(pick(raw, "portal") ?? (String(url).includes("bayut") ? "Bayut" : "Property Finder"))],
        agent: {
          name: String(pick(raw, "agentName", "agent") ?? "Listing agent"),
          phone: String(pick(raw, "agentPhone", "phone") ?? ""),
        },
        imageHue: Math.abs([...building].reduce((a, c) => a + c.charCodeAt(0), 0)) % 360,
        comps: [],
        firstSeen: today,
        sourceUrl: typeof url === "string" ? url : undefined,
        _source: source,
      };
    })
    .filter(Boolean);

  // Benchmarks from the batch, most specific grouping that has enough depth:
  // building+bed-band → community+bed-band → building → none. Bed banding
  // matters: a 4-bed's psf is structurally lower than a studio's, so an
  // unbanded community average flags every large unit as "below market".
  const groupPsf = (keyFn) => {
    const map = new Map();
    for (const l of interim) {
      const k = keyFn(l);
      const arr = map.get(k) ?? [];
      arr.push(l.askingPrice / l.sqft);
      map.set(k, arr);
    }
    return map;
  };
  const band = (beds) => (beds <= 0 ? "studio" : beds >= 4 ? "4plus" : String(beds));
  const byBuildingBand = groupPsf((l) => `${l.community}|${l.building}|${band(l.beds)}`);
  const byCommunityBand = groupPsf((l) => `${l.community}|${band(l.beds)}`);
  const byBuilding = groupPsf((l) => `${l.community}|${l.building}`);
  // Median resists a single mispriced outlier better than the mean.
  const median = (a) => {
    const s = [...a].sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  for (const l of interim) {
    const bb = byBuildingBand.get(`${l.community}|${l.building}|${band(l.beds)}`) ?? [];
    const cb = byCommunityBand.get(`${l.community}|${band(l.beds)}`) ?? [];
    const bldg = byBuilding.get(`${l.community}|${l.building}`) ?? [];
    if (bb.length >= 3) {
      l.benchmarkPsf = Math.round(median(bb));
      l.benchmarkSource = "Listing averages";
    } else if (cb.length >= 3) {
      l.benchmarkPsf = Math.round(median(cb));
      l.benchmarkSource = "Listing averages";
    } else if (bldg.length >= 3) {
      l.benchmarkPsf = Math.round(median(bldg));
      l.benchmarkSource = "Listing averages";
    } else {
      // Not enough comparable stock in this batch — no below-market claim.
      l.benchmarkPsf = Math.round(l.askingPrice / l.sqft);
    }
    l.comps = interim
      .filter((o) => o.id !== l.id && o.community === l.community && band(o.beds) === band(l.beds))
      .slice(0, 3)
      .map((o) => ({
        source: "Listing avg",
        label: `${o.building} · ${o.beds === 0 ? "Studio" : `${o.beds}BR`}`,
        date: today,
        price: o.askingPrice,
        sqft: o.sqft,
        beds: o.beds,
      }));
    delete l._source;
  }

  // Dedupe by id, keeping the first occurrence.
  const seen = new Set();
  return interim.filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)));
}

// CLI use
if (process.argv[1] && process.argv[1].endsWith("transform-listings.mjs")) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/transform-listings.mjs <raw.json> > listings.json");
    process.exit(1);
  }
  const out = transform(JSON.parse(readFileSync(file, "utf8")));
  process.stdout.write(JSON.stringify(out, null, 2));
  console.error(`Transformed ${out.length} listings.`);
}
