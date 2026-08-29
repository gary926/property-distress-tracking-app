import type { Emirate, PropertyType, ScoredListing } from "./types";

export interface Filters {
  emirate: Emirate | "All UAE";
  location: string | null; // community or building picked from search
  type: PropertyType | "All";
  beds: number | null; // null = any, 4 = 4+
  price: "any" | "u1" | "1to3" | "3to10" | "o10";
  minScore: number;
}

export const defaultFilters: Filters = {
  emirate: "All UAE",
  location: null,
  type: "All",
  beds: null,
  price: "any",
  minScore: 0,
};

export const emirates: (Emirate | "All UAE")[] = [
  "All UAE",
  "Dubai",
  "Abu Dhabi",
  "Sharjah",
  "Ajman",
  "Ras Al Khaimah",
];

export const priceLabels: Record<Filters["price"], string> = {
  any: "Any price",
  u1: "Under 1M",
  "1to3": "1M – 3M",
  "3to10": "3M – 10M",
  o10: "Over 10M",
};

export function applyFilters(deals: ScoredListing[], f: Filters): ScoredListing[] {
  return deals.filter((d) => {
    if (f.emirate !== "All UAE" && d.emirate !== f.emirate) return false;
    if (
      f.location &&
      d.community !== f.location &&
      d.building !== f.location
    )
      return false;
    if (f.type !== "All" && d.type !== f.type) return false;
    if (f.beds !== null && (f.beds === 4 ? d.beds < 4 : d.beds !== f.beds)) return false;
    if (f.price === "u1" && d.askingPrice >= 1_000_000) return false;
    if (f.price === "1to3" && (d.askingPrice < 1_000_000 || d.askingPrice > 3_000_000)) return false;
    if (f.price === "3to10" && (d.askingPrice < 3_000_000 || d.askingPrice > 10_000_000)) return false;
    if (f.price === "o10" && d.askingPrice <= 10_000_000) return false;
    if (d.score < f.minScore) return false;
    return true;
  });
}

export interface LocationSuggestion {
  kind: "Area" | "Building";
  name: string;
  emirate: Emirate;
}

export function locationSuggestions(deals: ScoredListing[]): LocationSuggestion[] {
  const seen = new Set<string>();
  const out: LocationSuggestion[] = [];
  for (const d of deals) {
    if (!seen.has(d.community)) {
      seen.add(d.community);
      out.push({ kind: "Area", name: d.community, emirate: d.emirate });
    }
    if (!seen.has(d.building)) {
      seen.add(d.building);
      out.push({ kind: "Building", name: d.building, emirate: d.emirate });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
