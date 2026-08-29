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

export interface Listing {
  id: string;
  title: string;
  building: string;
  community: string;
  emirate: Emirate;
  type: PropertyType;
  beds: number;
  baths: number;
  sqft: number;
  askingPrice: number;
  priceHistory: PricePoint[]; // oldest → newest, first = original listing price
  benchmarkPsf: number; // building/community avg AED per sqft
  benchmarkSource: "DLD transactions" | "Listing averages";
  listedDate: string;
  relistCount: number;
  keywords: string[]; // distress keywords found in listing text
  description: string;
  portals: Portal[];
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
  belowMarketPct: number; // % below benchmark psf
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
