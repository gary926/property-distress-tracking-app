import { useState } from "react";
import { useStore } from "../store";
import { Link, useRouter } from "../router";
import type { DealStatus } from "../../shared/types";
import { countPriceCuts } from "../../shared/scoring";
import { formatAED, formatDate } from "../../shared/format";
import { PropertyArt } from "../components/PropertyArt";
import { ScoreRing } from "../components/ScoreRing";
import { TierBadge, signalIconFor } from "../components/Badges";
import { PriceChart } from "../components/PriceChart";
import {
  IconArrowLeft,
  IconBan,
  IconBed,
  IconBookmark,
  IconCalendar,
  IconExternal,
  IconMapPin,
  IconMoon,
  IconPhone,
  IconRefresh,
  IconRuler,
  IconTrendDown,
} from "../icons";

const statuses: { key: DealStatus; label: string }[] = [
  { key: "new", label: "New" },
  { key: "reviewing", label: "Reviewing" },
  { key: "contacted", label: "Contacted" },
  { key: "negotiating", label: "Negotiating" },
  { key: "closed", label: "Closed" },
];

export function DealDetail({ id }: { id: string }) {
  const { allDeals, dealState, setStatus, toggleWatchlist, snooze, neverFlag, setNote } = useStore();
  const { navigate } = useRouter();
  const deal = allDeals.find((d) => d.id === id);
  const state = dealState[id];
  const [noteDraft, setNoteDraft] = useState(state?.note ?? "");
  const [snoozed, setSnoozed] = useState(false);

  if (!deal) {
    return (
      <div className="card empty section-gap">
        <p style={{ margin: 0, fontWeight: 500 }}>Deal not found.</p>
        <Link to="/" className="btn btn-secondary" style={{ marginTop: 16 }}>
          Back to dashboard
        </Link>
      </div>
    );
  }

  const watchlisted = state?.watchlisted ?? false;
  // The chart's reference line uses the strongest benchmark we have.
  const refPsf = deal.buildingPsf ?? deal.areaPsf ?? deal.benchmarkPsf ?? null;
  const fairValue = refPsf ? Math.round(refPsf * deal.sqft) : deal.askingPrice;
  const cuts = countPriceCuts(deal);

  return (
    <>
      <div className="detail-top">
        <button className="icon-btn" aria-label="Back" onClick={() => history.length > 1 ? history.back() : navigate("/")}>
          <IconArrowLeft size={20} />
        </button>
        <div className="detail-actions">
          <button
            className="icon-btn"
            title={snoozed ? "Snoozed for 7 days" : "Snooze for 7 days"}
            aria-label="Snooze for 7 days"
            onClick={() => {
              snooze(deal.id, 7);
              setSnoozed(true);
            }}
            style={snoozed ? { color: "var(--primary)" } : undefined}
          >
            <IconMoon size={19} />
          </button>
          <button
            className="icon-btn"
            title="Never flag this unit again"
            aria-label="Never flag this unit again"
            onClick={() => {
              neverFlag(deal.id);
              navigate("/");
            }}
          >
            <IconBan size={19} />
          </button>
          <button
            className="icon-btn"
            title={watchlisted ? "Remove from watchlist" : "Add to watchlist"}
            aria-label="Watchlist"
            aria-pressed={watchlisted}
            onClick={() => toggleWatchlist(deal.id)}
            style={watchlisted ? { color: "var(--primary)" } : undefined}
          >
            <IconBookmark size={19} fill={watchlisted ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      <div className="detail-hero enter">
        <PropertyArt listing={deal} className="art" />
        <span style={{ position: "absolute", top: 16, left: 16 }}>
          <TierBadge tier={deal.tier} />
        </span>
        <span
          className="t-caps"
          style={{
            position: "absolute",
            right: 16,
            bottom: 16,
            background: "rgb(255 255 255 / 0.8)",
            borderRadius: 999,
            padding: "5px 12px",
            backdropFilter: "blur(4px)",
          }}
        >
          Placeholder art · photos come with the live feed
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginTop: 22 }}>
        <div>
          <h1 className="t-headline-lg" style={{ maxWidth: 640 }}>
            {deal.building} — {deal.title}
          </h1>
          <p className="t-muted" style={{ display: "flex", alignItems: "center", gap: 6, margin: "8px 0 0" }}>
            <IconMapPin size={16} />
            {deal.community}, {deal.emirate} · {deal.type}
          </p>
          <div style={{ marginTop: 16 }}>
            <p className="t-caps" style={{ margin: 0 }}>
              Asking price
            </p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <span className="t-kpi grad-text tnum">{formatAED(deal.askingPrice)}</span>
              {deal.belowMarketPct >= 1 && (
                <span className="below-pill" style={{ fontSize: 14, padding: "4px 12px" }}>
                  {deal.belowMarketPct.toFixed(0)}% below market
                </span>
              )}
              {deal.dropPct >= 1 && (
                <span className="drop tnum" style={{ fontSize: 16 }}>
                  ↓{deal.dropPct.toFixed(1)}% vs original {formatAED(deal.priceHistory[0].price)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <ScoreRing score={deal.score} size={84} stroke={7} />
        </div>
      </div>

      <div className="detail-grid">
        <div className="stack">
          <section className="card panel enter">
            <h2 className="t-headline-md">Why this was flagged</h2>
            {deal.signals.length === 0 && (
              <p className="t-muted" style={{ margin: 0 }}>
                No great-deal signals fired at the current thresholds.
              </p>
            )}
            {deal.signals.map((s) => {
              const Icon = signalIconFor(s.kind);
              return (
                <div key={s.kind} className="why-item">
                  <span className="why-ico">
                    <Icon size={18} strokeWidth={1.75} />
                  </span>
                  <div>
                    <b>{s.label}</b>
                    <p>{s.detail}</p>
                  </div>
                  <span className="why-pts grad-text tnum">+{s.points}</span>
                </div>
              );
            })}
          </section>

          <section className="card panel enter">
            <h2 className="t-headline-md">Price history</h2>
            <PriceChart history={deal.priceHistory} fairValue={fairValue} />
          </section>

          <section className="card panel enter">
            <h2 className="t-headline-md">Market alignment</h2>
            <div className="bench-hero">
              <span className="big tnum">AED {Math.round(deal.psf).toLocaleString()}/sqft</span>
              <span className="t-muted">this unit&rsquo;s asking rate</span>
            </div>
            <div className="fact-grid" style={{ marginTop: 14 }}>
              <BenchmarkCard
                label={`${deal.buildingPsfLabel ?? deal.building} average`}
                scope={
                  deal.buildingPsfLabel && deal.buildingPsfLabel !== deal.building
                    ? "Same development"
                    : "Same building"
                }
                psf={deal.buildingPsf}
                pct={deal.belowBuildingPct}
                primary={deal.belowMarketBasis === "building"}
              />
              <BenchmarkCard
                label={`${deal.community} average`}
                scope="Wider area"
                psf={deal.areaPsf ?? deal.benchmarkPsf}
                pct={deal.belowAreaPct}
                primary={deal.belowMarketBasis === "area"}
              />
              {deal.buildingTxnPsf ? (
                <BenchmarkCard
                  label={
                    deal.buildingTxnLow && deal.buildingTxnHigh
                      ? `${deal.buildingTxnCount} sales in ${deal.building}, ` +
                        `${Math.round(deal.buildingTxnLow).toLocaleString()}–${Math.round(deal.buildingTxnHigh).toLocaleString()}`
                      : `${deal.buildingTxnCount} recorded sale${deal.buildingTxnCount === 1 ? "" : "s"} in ${deal.building}`
                  }
                  scope="What buyers paid"
                  psf={deal.buildingTxnPsf}
                  pct={((deal.buildingTxnPsf - deal.psf) / deal.buildingTxnPsf) * 100}
                  primary={false}
                />
              ) : null}
            </div>
            {deal.buildingTxnPsf ? (
              <p className="t-muted" style={{ fontSize: 13, margin: "12px 0 0" }}>
                The two averages above are <b>asking</b> prices, like this listing, so they are
                what the score compares against. &ldquo;What buyers paid&rdquo; is
                <b> settled</b> prices for this exact building — the closest comparison there
                is, but a different basis, so it is shown as evidence and never scored.
              </p>
            ) : null}
            <p className="t-muted" style={{ fontSize: 13, margin: "12px 0 14px" }}>
              Source: {deal.benchmarkSource}.{" "}
              {deal.belowMarketBasis === "building" ? (
                <>
                  Scored on the building comparison — same tower and spec, so a gap points at
                  the seller rather than the asset.
                </>
              ) : deal.belowMarketBasis === "area" ? (
                <>
                  No building average available, so this is scored on the area comparison at
                  reduced confidence.
                </>
              ) : (
                <>Not enough comparable stock to judge this one against the market yet.</>
              )}
              {refPsf ? (
                <>
                  {" "}Fair value at that rate:{" "}
                  <b className="tnum" style={{ color: "var(--ink)" }}>{formatAED(fairValue)}</b>.
                </>
              ) : null}
            </p>
            <div className="table-wrap">
              <table className="comps-table">
                <thead>
                  <tr>
                    <th>Comparable</th>
                    <th>Date</th>
                    <th>Price</th>
                    <th>AED/sqft</th>
                  </tr>
                </thead>
                <tbody>
                  {deal.comps.map((c) => (
                    <tr key={`${c.label}-${c.date}`}>
                      <td>
                        {c.label}
                        <span style={{ marginLeft: 8, fontSize: 11, color: "var(--muted)" }}>{c.source}</span>
                      </td>
                      <td className="tnum">{formatDate(c.date)}</td>
                      <td className="tnum">{formatAED(c.price)}</td>
                      <td className="tnum">{Math.round(c.price / c.sqft).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card panel enter">
            <h2 className="t-headline-md">Listing</h2>
            <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 15 }}>{deal.description}</p>
          </section>
        </div>

        <div className="stack">
          <section className="card panel enter">
            <h2 className="t-headline-md">Deal status</h2>
            <div className="stepper" role="tablist" aria-label="Deal status">
              {statuses.map((s) => (
                <button
                  key={s.key}
                  role="tab"
                  aria-selected={(state?.status ?? "new") === s.key}
                  className={(state?.status ?? "new") === s.key ? "active" : ""}
                  onClick={() => setStatus(deal.id, s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button
              className="btn-ghost"
              style={{ marginTop: 10, fontSize: 13.5, color: "var(--error)" }}
              onClick={() => setStatus(deal.id, "dismissed")}
            >
              {state?.status === "dismissed" ? "Dismissed ✓" : "Dismiss this deal"}
            </button>
            <textarea
              className="note-box"
              style={{ marginTop: 14 }}
              placeholder="Notes — offer strategy, agent context, valuation thoughts…"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={() => setNote(deal.id, noteDraft)}
              aria-label="Deal notes"
            />
          </section>

          <section className="card panel enter">
            <h2 className="t-headline-md">Key facts</h2>
            <div className="fact-grid">
              <Fact icon={<IconRuler size={17} />} label="Built-up area" value={`${deal.sqft.toLocaleString()} sqft`} />
              <Fact icon={<IconBed size={17} />} label="Bedrooms" value={deal.beds === 0 ? "Studio" : `${deal.beds} Beds`} />
              <Fact icon={<IconCalendar size={17} />} label="Listed" value={formatDate(deal.listedDate)} />
              <Fact icon={<IconTrendDown size={17} />} label="Price cuts" value={`${cuts} time${cuts === 1 ? "" : "s"}`} />
              <Fact icon={<IconCalendar size={17} />} label="Days on market" value={`${deal.daysOnMarket} days`} />
              <Fact icon={<IconRefresh size={17} />} label="Relisted" value={deal.relistCount > 0 ? `${deal.relistCount}×` : "No"} />
            </div>
          </section>

          <section className="card panel enter">
            <h2 className="t-headline-md">Sources & agent</h2>
            {deal.portals.map((p) => {
              // Prefer the per-portal deep link; fall back to the single-URL
              // form written by earlier sweeps.
              const href = deal.sourceUrls?.[p] ?? deal.sourceUrl;
              if (!href) {
                return (
                  <span key={p} className="setting-row" style={{ color: "var(--muted)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <IconExternal size={16} />
                      {p}
                    </span>
                    <span style={{ fontSize: 12.5 }}>no link captured</span>
                  </span>
                );
              }
              return (
                <a
                  key={p}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="setting-row"
                  style={{ color: "var(--primary)", fontWeight: 500 }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <IconExternal size={16} />
                    View on {p}
                  </span>
                  <span className="t-muted" style={{ fontSize: 12.5 }}>opens in a new tab</span>
                </a>
              );
            })}
            <div className="setting-row">
              <span>
                <b style={{ fontSize: 14.5 }}>{deal.agent.name}</b>
                <span className="sub tnum">{deal.agent.phone}</span>
              </span>
              <a className="btn btn-primary" href={`tel:${deal.agent.phone.replace(/\s/g, "")}`}>
                <IconPhone size={16} /> Contact agent
              </a>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function BenchmarkCard({
  label,
  scope,
  psf,
  pct,
  primary,
}: {
  label: string;
  scope: string;
  psf?: number;
  pct: number | null;
  primary: boolean;
}) {
  return (
    <div className="card fact" style={primary ? { borderColor: "var(--primary)" } : undefined}>
      <p style={{ margin: 0 }}>{scope}</p>
      <b className="tnum" style={{ fontSize: 17 }}>
        {psf ? `AED ${Math.round(psf).toLocaleString()}/sqft` : "Not available"}
      </b>
      <p style={{ marginTop: 4 }}>{label}</p>
      {pct !== null && (
        <span
          className="below-pill"
          style={
            pct >= 1
              ? { marginTop: 6 }
              : { marginTop: 6, background: "var(--surface-low)", color: "var(--muted)" }
          }
        >
          {pct >= 1 ? `${pct.toFixed(0)}% below` : `${Math.abs(pct).toFixed(0)}% above`}
        </span>
      )}
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card fact">
      {icon}
      <p>{label}</p>
      <b className="tnum">{value}</b>
    </div>
  );
}
