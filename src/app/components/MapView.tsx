import { useState } from "react";
import type { ScoredListing } from "../../shared/types";
import { formatAED } from "../../shared/format";
import { Link } from "../router";

/** Stylized schematic of the UAE coast — communities hand-placed on a
 *  decorative canvas; swappable for a real map provider without touching the
 *  dashboard. */
const positions: Record<string, { x: number; y: number }> = {
  "Dubai Marina": { x: 40, y: 62 },
  "Jumeirah Lake Towers": { x: 44, y: 68 },
  "Palm Jumeirah": { x: 37, y: 54 },
  "Umm Suqeim": { x: 44, y: 50 },
  "Downtown Dubai": { x: 52, y: 55 },
  "Mohammed Bin Rashid City": { x: 55, y: 61 },
  "Dubai Creek Harbour": { x: 58, y: 52 },
  "Jumeirah Village Circle": { x: 47, y: 66 },
  "Dubai Sports City": { x: 45, y: 72 },
  "Damac Hills 2": { x: 53, y: 80 },
  "Al Reem Island": { x: 16, y: 84 },
  "Al Raha Beach": { x: 22, y: 88 },
  "Yas Island": { x: 24, y: 82 },
  Aljada: { x: 66, y: 48 },
  "Al Khan": { x: 62, y: 44 },
  "Al Sawan": { x: 70, y: 38 },
  "Al Hamra Village": { x: 82, y: 18 },
};

const tierColor: Record<string, string> = { hot: "#e11d48", warm: "#d97706", watch: "#64748b" };

export function MapView({ deals }: { deals: ScoredListing[] }) {
  const [active, setActive] = useState<ScoredListing | null>(null);
  // Deals in the same community fan out slightly so pins don't stack.
  const seen: Record<string, number> = {};

  return (
    <div className="card map-view enter">
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(115deg, #dbeafe 0%, #e7f0fb 34%, #f6f4ec 60%, #f3ecdd 100%)",
        }}
      />
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.6 }}
      >
        <path
          d="M0,70 C15,66 22,74 30,60 C38,46 50,44 60,38 C70,32 74,20 84,12 L100,0 L100,100 L0,100 Z"
          fill="#eee9da"
        />
        <path
          d="M0,70 C15,66 22,74 30,60 C38,46 50,44 60,38 C70,32 74,20 84,12"
          fill="none"
          stroke="#c9d8ea"
          strokeWidth="0.5"
        />
      </svg>
      <p
        className="t-caps"
        style={{
          position: "absolute",
          left: 16,
          top: 16,
          margin: 0,
          background: "rgb(255 255 255 / 0.7)",
          borderRadius: 999,
          padding: "6px 12px",
          backdropFilter: "blur(4px)",
        }}
      >
        Schematic view · Arabian Gulf coast
      </p>

      {deals.map((d) => {
        const pos = positions[d.community];
        if (!pos) return null;
        const n = (seen[d.community] = (seen[d.community] ?? 0) + 1);
        const dx = ((n - 1) % 3) * 3.4;
        const dy = Math.floor((n - 1) / 3) * 4;
        return (
          <button
            key={d.id}
            className="map-pin"
            style={{ left: `${pos.x + dx}%`, top: `${pos.y + dy}%` }}
            aria-label={`${d.building}, score ${d.score}`}
            onMouseEnter={() => setActive(d)}
            onFocus={() => setActive(d)}
          >
            <span style={{ background: tierColor[d.tier] }}>{d.score}</span>
          </button>
        );
      })}

      {active && (
        <Link to={`/deals/${active.id}`} className="card map-card enter">
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {active.building}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
              {active.community}, {active.emirate}
            </p>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <p className="tnum" style={{ margin: 0, fontWeight: 600 }}>
              {formatAED(active.askingPrice)}
            </p>
            {active.belowMarketPct >= 1 && (
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--pos)" }}>
                {active.belowMarketPct.toFixed(0)}% below market
              </p>
            )}
          </div>
        </Link>
      )}
    </div>
  );
}
