import { useMemo, useState } from "react";
import { useStore } from "../store";
import {
  applyFilters,
  defaultFilters,
  locationSuggestions,
  type Filters,
} from "../../shared/filters";
import { SearchBar } from "../components/SearchBar";
import { FilterBar } from "../components/FilterBar";
import { DealCard } from "../components/DealCard";
import { DealTable } from "../components/DealTable";
import { MapView } from "../components/MapView";
import { useCountUp } from "../useCountUp";
import {
  IconBriefcase,
  IconGrid,
  IconList,
  IconMap,
  IconPercent,
  IconTarget,
  IconTrendUp,
  IconZap,
} from "../icons";

type View = "cards" | "table" | "map";
type Sort = "score" | "discount" | "fresh" | "price";

function Kpi({
  label,
  value,
  suffix,
  trend,
  icon,
  gradient,
  decimals = 0,
}: {
  label: string;
  value: number;
  suffix?: string;
  trend?: string;
  icon: React.ReactNode;
  gradient?: boolean;
  decimals?: number;
}) {
  const animated = useCountUp(value);
  return (
    <div className="card kpi enter">
      <div className="kpi-top">
        <span className="t-caps">{label}</span>
        {icon}
      </div>
      <div className={`t-kpi tnum${gradient ? " grad-text" : ""}`}>
        {animated.toFixed(decimals)}
        {suffix && <span style={{ fontSize: 22, fontWeight: 500 }}>{suffix}</span>}
      </div>
      {trend && (
        <span className="kpi-trend">
          <IconTrendUp size={14} strokeWidth={2} />
          {trend}
        </span>
      )}
    </div>
  );
}

export function Dashboard() {
  const { deals, dealState, dataSource } = useStore();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [view, setView] = useState<View>("cards");
  const [sort, setSort] = useState<Sort>("score");

  const suggestions = useMemo(() => locationSuggestions(deals), [deals]);
  const filtered = useMemo(() => {
    const list = applyFilters(deals, filters);
    const sorted = [...list];
    if (sort === "score") sorted.sort((a, b) => b.score - a.score);
    if (sort === "discount") sorted.sort((a, b) => b.belowMarketPct - a.belowMarketPct);
    if (sort === "fresh") sorted.sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));
    if (sort === "price") sorted.sort((a, b) => a.askingPrice - b.askingPrice);
    return sorted;
  }, [deals, filters, sort]);

  const newest = useMemo(
    () => deals.reduce((max, d) => (d.firstSeen > max ? d.firstSeen : max), ""),
    [deals],
  );
  const newToday = deals.filter((d) => d.firstSeen === newest).length;
  const flagged = deals.filter((d) => d.signals.length > 0);
  const avgDiscount =
    flagged.length > 0
      ? flagged.reduce((sum, d) => sum + Math.max(d.belowMarketPct, 0), 0) / flagged.length
      : 0;
  const inPipeline = Object.values(dealState).filter((s) =>
    ["reviewing", "contacted", "negotiating"].includes(s.status),
  ).length;

  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <header className="page-head">
        <div className="glow-header" />
        <h1 className="t-headline-lg">{greeting}, Garvit</h1>
        <p>
          {flagged.length} distressed deals on the radar
          {dataSource === "demo" ? " · demo snapshot until the first live sync" : ""}
        </p>
      </header>

      <div className="kpi-grid">
        <Kpi label="Active deals" value={flagged.length} icon={<IconTarget size={18} />} trend={`${newToday} new`} />
        <Kpi
          label="New today"
          value={newToday}
          icon={<IconZap size={18} />}
          gradient
        />
        <Kpi
          label="Avg discount"
          value={avgDiscount}
          suffix="%"
          decimals={0}
          icon={<IconPercent size={18} />}
          trend="vs market rate"
        />
        <Kpi label="In pipeline" value={inPipeline} icon={<IconBriefcase size={18} />} />
      </div>

      <div className="search-wrap">
        <SearchBar
          suggestions={suggestions}
          selected={filters.location}
          onSelect={(location) => setFilters({ ...filters, location })}
        />
      </div>

      <div className="filters">
        <FilterBar filters={filters} onChange={setFilters} />
      </div>

      <div className="feed-head">
        <div className="chip-select set" style={{ flexShrink: 0 }}>
          <select value={sort} aria-label="Sort deals" onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="score">Sort: Distress score</option>
            <option value="discount">Sort: Biggest discount</option>
            <option value="fresh">Sort: Newest first</option>
            <option value="price">Sort: Lowest price</option>
          </select>
          <svg viewBox="0 0 10 6" width="10" height="6">
            <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div className="view-toggle" role="tablist" aria-label="View">
          {(
            [
              ["cards", "Cards", IconGrid],
              ["table", "Table", IconList],
              ["map", "Map", IconMap],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              role="tab"
              aria-selected={view === key}
              className={view === key ? "active" : ""}
              onClick={() => setView(key)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card empty">
          <p style={{ margin: 0, fontWeight: 500 }}>No deals match these filters.</p>
          <p style={{ margin: "6px 0 0", fontSize: 14 }}>
            Widen the emirate, price range, or lower the score threshold.
          </p>
        </div>
      ) : view === "cards" ? (
        <div className="deal-grid">
          {filtered.map((deal, i) => (
            <DealCard key={deal.id} deal={deal} index={i} />
          ))}
        </div>
      ) : view === "table" ? (
        <DealTable deals={filtered} />
      ) : (
        <MapView deals={filtered} />
      )}
    </>
  );
}
