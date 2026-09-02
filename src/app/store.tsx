import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, post, put } from "./api";
import { defaultScoring, scoreListing } from "../shared/scoring";
import type {
  AlertSettings,
  DealStatus,
  Listing,
  SavedSearch,
  ScoredListing,
  ScoringSettings,
} from "../shared/types";

export const defaultAlerts: AlertSettings = {
  push: {
    newHotDeal: true,
    anyNewFlag: false,
    watchlistPriceCut: true,
    savedSearchMatch: true,
    minScore: 70,
    minDiscount: 10,
    frequency: "instant",
    quietHours: { enabled: true, from: "22:00", to: "07:00" },
  },
  email: {
    newHotDeal: true,
    anyNewFlag: true,
    watchlistPriceCut: true,
    savedSearchMatch: true,
    minScore: 50,
    minDiscount: 8,
    frequency: "digest",
    address: "",
  },
  digest: { enabled: true, time: "08:00", frequency: "daily" },
};

export const defaultSavedSearches: SavedSearch[] = [
  {
    id: "ss-marina-yield",
    name: "Dubai Marina — High Yield",
    created: "2026-08-12",
    enabled: true,
    criteria: ["Dubai Marina", "Score > 70", "Apartments", "< AED 3M"],
    minScore: 70,
    channels: { push: true, email: true, digest: true },
  },
  {
    id: "ss-palm-villas",
    name: "Palm Jumeirah — Villas",
    created: "2026-08-20",
    enabled: true,
    criteria: ["Palm Jumeirah", "Villas", "< AED 15M", "Score > 50"],
    minScore: 50,
    channels: { push: true, email: false, digest: true },
  },
  {
    id: "ss-jvc-1br",
    name: "JVC 1-beds under 1M",
    created: "2026-08-26",
    enabled: false,
    criteria: ["JVC", "1 bed", "< AED 1M"],
    minScore: 40,
    channels: { push: false, email: false, digest: true },
  },
];

export interface DealState {
  status: DealStatus;
  watchlisted: boolean;
  snoozedUntil?: string;
  neverFlag?: boolean;
  note?: string;
}

type Phase = "loading" | "login" | "ready" | "error";

interface Store {
  phase: Phase;
  loadError: string | null;
  dataSource: "live" | "demo";
  deals: ScoredListing[];
  allDeals: ScoredListing[];
  dealState: Record<string, DealState>;
  setStatus: (id: string, status: DealStatus) => void;
  toggleWatchlist: (id: string) => void;
  snooze: (id: string, days: number) => void;
  neverFlag: (id: string) => void;
  setNote: (id: string, note: string) => void;
  savedSearches: SavedSearch[];
  setSavedSearches: (s: SavedSearch[]) => void;
  alerts: AlertSettings;
  setAlerts: (a: AlertSettings) => void;
  scoring: ScoringSettings;
  setScoring: (s: ScoringSettings) => void;
  login: (password: string) => Promise<void>;
  logout: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [dataSource, setDataSource] = useState<"live" | "demo">("demo");
  const [dealState, setDealState] = useState<Record<string, DealState>>({});
  const [savedSearches, setSavedSearchesState] = useState<SavedSearch[]>(defaultSavedSearches);
  const [alerts, setAlertsState] = useState<AlertSettings>(defaultAlerts);
  const [scoring, setScoringState] = useState<ScoringSettings>(defaultScoring);

  const loadAll = useCallback(async () => {
    const [listingsRes, stateRes] = await Promise.all([
      api<{ source: "live" | "demo"; listings: Listing[] }>("/api/listings"),
      api<{
        dealState: Record<string, DealState>;
        alerts: AlertSettings | null;
        scoring: ScoringSettings | null;
        savedSearches: SavedSearch[] | null;
      }>("/api/state"),
    ]);
    setListings(listingsRes.listings);
    setDataSource(listingsRes.source);
    setDealState(stateRes.dealState ?? {});
    if (stateRes.alerts) setAlertsState({ ...defaultAlerts, ...stateRes.alerts });
    if (stateRes.scoring) setScoringState({ ...defaultScoring, ...stateRes.scoring });
    if (stateRes.savedSearches) setSavedSearchesState(stateRes.savedSearches);
    setPhase("ready");
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const session = await api<{ authenticated: boolean }>("/api/session");
        if (!session.authenticated) {
          setPhase("login");
          return;
        }
        await loadAll();
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load");
        setPhase("error");
      }
    })();
  }, [loadAll]);

  const login = useCallback(
    async (password: string) => {
      await post("/api/login", { password });
      setPhase("loading");
      await loadAll();
    },
    [loadAll],
  );

  const logout = useCallback(() => {
    void post("/api/logout");
    setPhase("login");
  }, []);

  const allDeals = useMemo(
    () => listings.map((l) => scoreListing(l, scoring)).sort((a, b) => b.score - a.score),
    [listings, scoring],
  );
  const deals = useMemo(
    () => allDeals.filter((d) => !dealState[d.id]?.neverFlag),
    [allDeals, dealState],
  );

  const patchDeal = useCallback((id: string, p: Partial<DealState>) => {
    setDealState((prev) => {
      const next: DealState = Object.assign(
        { status: "new" as DealStatus, watchlisted: false },
        prev[id],
        p,
      );
      void put(`/api/state/deal/${id}`, next).catch(() => {});
      return { ...prev, [id]: next };
    });
  }, []);

  const setSavedSearches = useCallback((s: SavedSearch[]) => {
    setSavedSearchesState(s);
    void put("/api/state/saved_searches", s).catch(() => {});
  }, []);
  const setAlerts = useCallback((a: AlertSettings) => {
    setAlertsState(a);
    void put("/api/state/alerts", a).catch(() => {});
  }, []);
  const setScoring = useCallback((s: ScoringSettings) => {
    setScoringState(s);
    void put("/api/state/scoring", s).catch(() => {});
  }, []);

  const store: Store = {
    phase,
    loadError,
    dataSource,
    deals,
    allDeals,
    dealState,
    setStatus: (id, status) => patchDeal(id, { status }),
    toggleWatchlist: (id) =>
      patchDeal(id, { watchlisted: !dealState[id]?.watchlisted }),
    snooze: (id, days) =>
      patchDeal(id, {
        snoozedUntil: new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10),
      }),
    neverFlag: (id) => patchDeal(id, { neverFlag: true }),
    setNote: (id, note) => patchDeal(id, { note }),
    savedSearches,
    setSavedSearches,
    alerts,
    setAlerts,
    scoring,
    setScoring,
    login,
    logout,
  };

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
