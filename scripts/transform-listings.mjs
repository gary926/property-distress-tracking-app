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

// v1 tracks SALE listings only — rentals are a v2 feature. Portals mix both in
// some result sets and the price scale differs by ~2 orders of magnitude, so a
// single rental slipping through would wreck every psf benchmark in its group.
const RENT_URL_MARKERS = ["/rent/", "/to-rent", "for-rent", "/rent?", "rent/"];
// Only an explicit price-period FIELD may use these. They must never be matched
// against a title: UAE sale listings routinely advertise instalment plans
// ("1% MONTHLY PAYMENT PLAN"), and treating that as a rental drops real deals.
const RENT_PERIOD_MARKERS = [
  "per year",
  "per month",
  "per annum",
  "yearly",
  "monthly",
  "/yr",
  "/year",
  "/month",
  "annually",
];
// Unambiguous in free text — no sale listing says "for rent".
const RENT_TEXT_MARKERS = ["for rent", "to rent", "for lease", "to let"];

function isRental(raw, title, url) {
  const purpose = String(
    pick(raw, "listingType", "purpose", "offeringType", "transactionType") ?? "",
  ).toLowerCase();
  if (purpose.includes("rent")) return true;
  if (purpose.includes("sale") || purpose.includes("buy")) return false;

  const u = String(url ?? "").toLowerCase();
  if (RENT_URL_MARKERS.some((m) => u.includes(m))) return true;

  const period = String(pick(raw, "pricePeriod", "rentFrequency", "frequency") ?? "").toLowerCase();
  if (period && RENT_PERIOD_MARKERS.some((m) => period.includes(m))) return true;

  return RENT_TEXT_MARKERS.some((m) => String(title ?? "").toLowerCase().includes(m));
}

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
      const urlEarly = pick(raw, "listingURL", "url", "link");
      if (isRental(raw, title, urlEarly)) return null;

      const rawCommunity = String(pick(raw, "communityArea", "community", "area", "location") ?? "").trim();
      // "Marina Gate, Dubai Marina" → community is the broader trailing part.
      // But portals often append the emirate ("City of Lights, Al Reem Island,
      // Abu Dhabi"); keeping that would file every Abu Dhabi listing under a
      // community literally named "Abu Dhabi" and break the area grouping.
      const EMIRATE_NAMES = [
        "dubai",
        "abu dhabi",
        "sharjah",
        "ajman",
        "ras al khaimah",
        "umm al quwain",
        "fujairah",
        "uae",
      ];
      let parts = rawCommunity.split(",").map((s) => s.trim()).filter(Boolean);
      while (parts.length > 1 && EMIRATE_NAMES.includes(parts[parts.length - 1].toLowerCase())) {
        parts = parts.slice(0, -1);
      }
      const community = parts[parts.length - 1] || "Unknown";
      // Portals return a path, not a name: "Peninsula Two, Peninsula, Business
      // Bay". The head of it is the tower and is what we show; the whole path
      // is kept for benchmark matching, since the published figure for a unit
      // in a sub-development is that sub-development's.
      const locationPath = String(
        pick(raw, "buildingTowerName", "building", "tower") ?? parts[0] ?? community,
      ).trim();
      const building = locationPath.split(",")[0].trim() || community;
      const url = pick(raw, "listingURL", "url", "link");
      const description = String(pick(raw, "description", "summary") ?? "").trim();
      const portalName = String(
        pick(raw, "portal") ?? (String(url).includes("bayut") ? "Bayut" : "Property Finder"),
      );
      const bedsRaw = pick(raw, "bedrooms", "beds");
      const beds = typeof bedsRaw === "number" ? bedsRaw : (num(bedsRaw) ?? 0);

      return {
        id: slugId(url, title, building),
        title: title || `${beds || "Studio"} in ${building}`,
        building,
        locationPath: locationPath === building ? undefined : locationPath,
        community,
        emirate: inferEmirate(raw, rawCommunity),
        type: inferType(raw, title, beds),
        beds,
        baths: num(pick(raw, "bathrooms", "baths")) ?? 1,
        sqft,
        askingPrice: price,
        listingType: "sale",
        // Portals publish both averages on the listing page. When the scrape
        // captured them, they beat anything computed from our own batch.
        publishedBuildingPsf: num(
          pick(raw, "buildingAveragePricePerSqft", "buildingPsf", "towerAveragePsf"),
        ),
        publishedAreaPsf: num(
          pick(raw, "areaAveragePricePerSqft", "areaPsf", "communityAveragePsf"),
        ),
        buildingPsf: undefined, // filled in below
        areaPsf: undefined, // filled in below
        benchmarkSource: "Listing averages",
        listedDate: today,
        relistCount: 0,
        keywords: findKeywords(title, description, JSON.stringify(pick(raw, "urgencyPhrases") ?? "")),
        description: description || title,
        portals: [portalName],
        agent: {
          name: String(pick(raw, "agentName", "agent") ?? "Listing agent"),
          phone: String(pick(raw, "agentPhone", "phone") ?? ""),
        },
        imageHue: Math.abs([...building].reduce((a, c) => a + c.charCodeAt(0), 0)) % 360,
        comps: [],
        firstSeen: today,
        sourceUrl: typeof url === "string" ? url : undefined,
        sourceUrls: typeof url === "string" ? { [portalName]: url } : undefined,
        _source: source,
      };
    })
    .filter(Boolean);

  // Two independent benchmarks, because they answer different questions:
  //   buildingPsf — the same tower. Strong evidence about THIS seller.
  //   areaPsf     — the surrounding community. Weaker: a whole tower can sit
  //                 below its area permanently without anyone being motivated.
  // Portal-published figures win when the scrape captured them; otherwise both
  // are computed from the batch, bed-banded (a 4-bed's psf is structurally
  // lower than a studio's, so an unbanded average flags every large unit).
  const band = (beds) => (beds <= 0 ? "studio" : beds >= 4 ? "4plus" : String(beds));
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
  const byBuildingBand = groupPsf((l) => `${l.community}|${l.building}|${band(l.beds)}`);
  const byBuilding = groupPsf((l) => `${l.community}|${l.building}`);
  const byAreaBand = groupPsf((l) => `${l.community}|${band(l.beds)}`);
  const byArea = groupPsf((l) => l.community);
  // Median resists a single mispriced outlier better than the mean.
  const median = (a) => {
    const s = [...a].sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  // A group must exclude the listing itself to be a fair comparison, so
  // require 3+ members (the unit plus at least two genuine comparables).
  const MIN_COMPARABLES = 3;
  const fromGroup = (groups, key) => {
    const arr = groups.get(key);
    return arr && arr.length >= MIN_COMPARABLES ? Math.round(median(arr)) : undefined;
  };

  let anyPublished = false;
  for (const l of interim) {
    l.buildingPsf =
      l.publishedBuildingPsf ??
      fromGroup(byBuildingBand, `${l.community}|${l.building}|${band(l.beds)}`) ??
      fromGroup(byBuilding, `${l.community}|${l.building}`);
    l.areaPsf =
      l.publishedAreaPsf ??
      fromGroup(byAreaBand, `${l.community}|${band(l.beds)}`) ??
      fromGroup(byArea, l.community);
    if (l.publishedBuildingPsf || l.publishedAreaPsf) anyPublished = true;
    l.benchmarkSource =
      l.publishedBuildingPsf || l.publishedAreaPsf ? "Portal published" : "Listing averages";
    // Comps stay bed-banded and within the same community.
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
    delete l.publishedBuildingPsf;
    delete l.publishedAreaPsf;
    delete l._source;
  }
  if (!anyPublished) {
    console.error(
      "Note: no portal-published averages found in this batch — benchmarks computed from the scrape itself.",
    );
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
