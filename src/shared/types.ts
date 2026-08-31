export type Emirate =
  | "Dubai"
  | "Abu Dhabi"
  | "Sharjah"
  | "Ajman"
  | "Ras Al Khaimah";

export type PropertyType = "Apartment" | "Penthouse" | "Villa" | "Townhouse";

export type Portal = "Property Finder" | "Bayut" | "Dubizzle";

export type SignalKind =
  | "price_drop"
  | "below_market"
  | "keyword"
  | "stale"
  | "relist";

export type Tier = "hot" | "warm" | "watch";

export type DealStatus =
  | "new"
  | "reviewing"
  | "contacted"
  | "negotiating"
  | "closed"
  | "dismissed";

export interface PricePoint {
  date: string; // ISO date
  price: number; // AED
}

export interface Comp {
  source: "DLD" | "Listing avg";
  label: string;
  date: string;
  price: number;
  sqft: number;
  beds: number;
}

/** v1 tracks sale listings only; rentals are a v2 feature. */
export type ListingType = "sale";

export interface Listing {
  id: string;
  /** Always "sale" in v1 — the ingest rejects rentals outright. */
  listingType: ListingType;
  title: string;
  building: string;
  /** The portal's full location path ("Noora Tower, Al Habtoor City, Business
   *  Bay") when it carries more than `building` does. Never displayed — it is
   *  what the benchmark matcher uses, because a unit's published comparison is
   *  often against its sub-development rather than its tower. */
  locationPath?: string;
  community: string;
  emirate: Emirate;
  type: PropertyType;
  beds: number;
  baths: number;
  sqft: number;
  askingPrice: number;
  priceHistory: PricePoint[]; // oldest → newest, first = original listing price
  /** Average AED/sqft for the *same building*, when known. The strongest
   *  comparison: same tower, same build quality, same service charges. */
  buildingPsf?: number;
  /** What `buildingPsf` actually describes. The portal's per-location table
   *  lists towers in some communities and sub-districts in others, so the
   *  figure is often the development's rather than the tower's — and saying
   *  "Beverly Crown average" when it is JVC District 11's would misstate it. */
  buildingPsfLabel?: string;
  /** Median AED/sqft of *recorded sales* in this listing's own building, from
   *  the portal's transactions table. Same tower, same size band — the closest
   *  comparison there is — but these are settled prices where `askingPrice` is
   *  an asking price, so it is deliberately kept out of `buildingPsf` and out
   *  of the score. Shown as evidence, not used as the benchmark. */
  buildingTxnPsf?: number;
  /** How many sales that median is over. Fewer than three is not published. */
  buildingTxnCount?: number;
  /** The cheapest and dearest of those sales. Shown alongside the median so a
   *  spread is visible rather than hidden behind one confident-looking number. */
  buildingTxnLow?: number;
  buildingTxnHigh?: number;
  /** Average AED/sqft for the surrounding area/community, when known.
   *  Weaker evidence on its own — a whole tower can sit below its area. */
  areaPsf?: number;
  /** Where the two figures above came from. Portals publish both on the
   *  listing page; otherwise they are computed from the scraped batch. */
  benchmarkSource: "DLD transactions" | "Portal published" | "Listing averages";
  /** Legacy single benchmark, kept so rows ingested before the split still
   *  score. Treated as the area figure when areaPsf is absent. */
  benchmarkPsf?: number;
  listedDate: string;
  relistCount: number;
  keywords: string[]; // great-deal keywords found in listing text
  description: string;
  portals: Portal[];
  /** Deep link per portal, so the detail page can open the real listing. */
  sourceUrls?: Partial<Record<Portal, string>>;
  /** Single-URL form written by earlier sweeps; still read as a fallback. */
  sourceUrl?: string;
  agent: { name: string; phone: string };
  imageHue: number; // deterministic placeholder art
  comps: Comp[];
  firstSeen: string; // when the radar captured it
}

export interface Signal {
  kind: SignalKind;
  label: string;
  detail: string;
  points: number; // contribution to the 0–100 score
}

export interface ScoredListing extends Listing {
  score: number;
  tier: Tier;
  signals: Signal[];
  dropPct: number; // % below original listing price
  psf: number;
  /** % below the building average (null when no building figure is known). */
  belowBuildingPct: number | null;
  /** % below the area average (null when no area figure is known). */
  belowAreaPct: number | null;
  /** The headline figure: building discount when available, else area. */
  belowMarketPct: number;
  /** Which comparison belowMarketPct came from. */
  belowMarketBasis: "building" | "area" | "none";
  daysOnMarket: number;
}

export interface SavedSearch {
  id: string;
  name: string;
  created: string;
  enabled: boolean;
  criteria: string[]; // human-readable chips
  minScore: number;
  channels: { push: boolean; email: boolean; digest: boolean };
}

export interface AlertChannelConfig {
  newHotDeal: boolean;
  anyNewFlag: boolean;
  watchlistPriceCut: boolean;
  savedSearchMatch: boolean;
  minScore: number;
  minDiscount: number;
  frequency: "instant" | "hourly" | "digest";
}

export interface AlertSettings {
  push: AlertChannelConfig & { quietHours: { enabled: boolean; from: string; to: string } };
  email: AlertChannelConfig & { address: string };
  digest: { enabled: boolean; time: string; frequency: "daily" | "weekly" };
}

export interface ScoringSettings {
  dropThresholdPct: number; // flag drops greater than this
  weights: { priceDrop: number; belowMarket: number; keyword: number; staleness: number };
  stalenessCutoffDays: number;
  keywords: string[];
}
