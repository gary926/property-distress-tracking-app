import { useEffect, useMemo, useRef, useState } from "react";
import type { LocationSuggestion } from "../../shared/filters";
import { IconBuilding, IconMapPin, IconSearch, IconX } from "../icons";

export function SearchBar({
  suggestions,
  selected,
  onSelect,
}: {
  suggestions: LocationSuggestion[];
  selected: string | null;
  onSelect: (name: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return suggestions.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, suggestions]);

  const areas = matches.filter((m) => m.kind === "Area");
  const buildings = matches.filter((m) => m.kind === "Building");

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(name: string) {
    onSelect(name);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div className="search-box">
        <IconSearch size={18} strokeWidth={1.75} style={{ color: "var(--muted)", flexShrink: 0 }} />
        {selected && (
          <span className="search-chip">
            {selected}
            <button aria-label={`Clear ${selected}`} onClick={() => onSelect(null)}>
              <IconX size={13} />
            </button>
          </span>
        )}
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && matches[highlight]) {
              e.preventDefault();
              pick(matches[highlight].name);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={selected ? "Refine search…" : "Search by area or building — “Marina Gate”, “JVC”…"}
          aria-label="Search by area or building"
        />
      </div>

      {open && matches.length > 0 && (
        <div className="card search-pop enter">
          {areas.length > 0 && <p className="t-caps" style={{ margin: "6px 16px 4px" }}>Areas</p>}
          {areas.map((s) => (
            <Row key={`a-${s.name}`} s={s} active={matches[highlight] === s} onPick={pick} />
          ))}
          {buildings.length > 0 && (
            <p className="t-caps" style={{ margin: "6px 16px 4px" }}>Buildings</p>
          )}
          {buildings.map((s) => (
            <Row key={`b-${s.name}`} s={s} active={matches[highlight] === s} onPick={pick} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  s,
  active,
  onPick,
}: {
  s: LocationSuggestion;
  active: boolean;
  onPick: (name: string) => void;
}) {
  const Icon = s.kind === "Area" ? IconMapPin : IconBuilding;
  return (
    <button className={`suggestion${active ? " active" : ""}`} onClick={() => onPick(s.name)}>
      <span className="suggestion-ico">
        <Icon size={15} strokeWidth={1.75} />
      </span>
      <b>{s.name}</b>
      <span>{s.emirate}</span>
    </button>
  );
}
