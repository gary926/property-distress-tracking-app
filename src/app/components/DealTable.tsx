import type { ScoredListing } from "../../shared/types";
import { formatAED } from "../../shared/format";
import { useRouter } from "../router";
import { TierBadge } from "./Badges";

export function DealTable({ deals }: { deals: ScoredListing[] }) {
  const { navigate } = useRouter();
  return (
    <div className="card table-wrap enter">
      <table className="deal-table">
        <thead>
          <tr>
            {["Property", "Location", "Price", "Drop", "vs Market", "PSF", "DOM", "Score"].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr key={d.id} onClick={() => navigate(`/deals/${d.id}`)}>
              <td>
                <b style={{ fontWeight: 500 }}>{d.building}</b>
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  {d.beds === 0 ? "Studio" : `${d.beds}BR`} {d.type} · {d.sqft.toLocaleString()} sqft
                </div>
              </td>
              <td style={{ color: "var(--ink-2)" }}>
                {d.community}
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{d.emirate}</div>
              </td>
              <td className="tnum" style={{ fontWeight: 600 }}>
                {formatAED(d.askingPrice)}
              </td>
              <td className="tnum">
                {d.dropPct >= 1 ? (
                  <span style={{ color: "var(--error)", fontWeight: 600 }}>↓{d.dropPct.toFixed(0)}%</span>
                ) : (
                  <span style={{ color: "var(--muted)" }}>—</span>
                )}
              </td>
              <td className="tnum">
                {d.belowMarketPct >= 1 ? (
                  <span style={{ color: "var(--pos)", fontWeight: 600 }}>
                    {d.belowMarketPct.toFixed(0)}% below
                  </span>
                ) : (
                  <span style={{ color: "var(--muted)" }}>at market</span>
                )}
              </td>
              <td className="tnum" style={{ color: "var(--ink-2)" }}>
                {Math.round(d.psf).toLocaleString()}
              </td>
              <td className="tnum" style={{ color: "var(--ink-2)" }}>{d.daysOnMarket}d</td>
              <td>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="grad-text tnum" style={{ fontSize: 16, fontWeight: 700 }}>
                    {d.score}
                  </span>
                  <TierBadge tier={d.tier} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
