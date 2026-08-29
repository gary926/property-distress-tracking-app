import { useState } from "react";
import { useStore } from "../store";
import { api } from "../api";
import { useEffect } from "react";
import { IconDatabase, IconMail, IconPlus, IconX } from "../icons";

interface Health {
  db: boolean;
  listingCount: number;
  secrets: Record<string, boolean>;
  fixtures?: boolean;
}

const sources = [
  { name: "Property Finder", note: "via scheduled Firecrawl sweep" },
  { name: "Bayut", note: "via scheduled Firecrawl sweep" },
  { name: "Dubizzle", note: "via scheduled Firecrawl sweep" },
  { name: "DLD open data", note: "benchmark transactions" },
];

export function Settings() {
  const { scoring, setScoring, alerts, setAlerts, dataSource } = useStore();
  const [health, setHealth] = useState<Health | null>(null);
  const [adding, setAdding] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");

  useEffect(() => {
    api<Health>("/api/health").then(setHealth).catch(() => {});
  }, []);

  function weight(key: keyof typeof scoring.weights, value: number) {
    setScoring({ ...scoring, weights: { ...scoring.weights, [key]: value } });
  }

  function addKeyword() {
    const kw = newKeyword.trim().toLowerCase();
    if (kw && !scoring.keywords.includes(kw)) {
      setScoring({ ...scoring, keywords: [...scoring.keywords, kw] });
    }
    setNewKeyword("");
    setAdding(false);
  }

  return (
    <>
      <header className="page-head">
        <div className="glow-header" />
        <h1 className="t-headline-lg">Settings</h1>
        <p>Configure radar sensitivity, triggers, and delivery.</p>
      </header>

      <p className="t-caps section-gap">Algorithm calibration</p>
      <section className="card panel enter" style={{ marginTop: 10 }}>
        <div className="slider-row" style={{ paddingTop: 0 }}>
          <div className="head">
            <span>
              Price-drop threshold
              <span className="sub t-muted" style={{ display: "block", fontSize: 12.5 }}>
                Flag listings that fell more than this vs their original price
              </span>
            </span>
            <b className="tnum">{scoring.dropThresholdPct}%</b>
          </div>
          <input
            type="range"
            min={5}
            max={25}
            value={scoring.dropThresholdPct}
            className="slider"
            aria-label="Price drop threshold"
            style={{ ["--fill" as string]: `${((scoring.dropThresholdPct - 5) / 20) * 100}%` }}
            onChange={(e) => setScoring({ ...scoring, dropThresholdPct: Number(e.target.value) })}
          />
        </div>
        {(
          [
            ["priceDrop", "Price-drop weight"],
            ["belowMarket", "Below-market weight"],
            ["keyword", "Keyword weight"],
            ["staleness", "Staleness weight"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="slider-row">
            <div className="head">
              <span>{label}</span>
              <b className="tnum">{scoring.weights[key]}</b>
            </div>
            <input
              type="range"
              min={0}
              max={50}
              value={scoring.weights[key]}
              className="slider"
              aria-label={label}
              style={{ ["--fill" as string]: `${(scoring.weights[key] / 50) * 100}%` }}
              onChange={(e) => weight(key, Number(e.target.value))}
            />
          </div>
        ))}
        <div className="slider-row">
          <div className="head">
            <span>
              Staleness cutoff
              <span className="sub t-muted" style={{ display: "block", fontSize: 12.5 }}>
                Days on market before a listing counts as stale
              </span>
            </span>
            <b className="tnum">{scoring.stalenessCutoffDays} days</b>
          </div>
          <input
            type="range"
            min={30}
            max={240}
            step={15}
            value={scoring.stalenessCutoffDays}
            className="slider"
            aria-label="Staleness cutoff"
            style={{ ["--fill" as string]: `${((scoring.stalenessCutoffDays - 30) / 210) * 100}%` }}
            onChange={(e) => setScoring({ ...scoring, stalenessCutoffDays: Number(e.target.value) })}
          />
        </div>
      </section>

      <p className="t-caps section-gap">Semantic triggers</p>
      <section className="card panel enter" style={{ marginTop: 10 }}>
        <p className="t-muted" style={{ margin: "0 0 14px", fontSize: 14 }}>
          Keywords that mark a listing as distressed when they appear in its text.
        </p>
        <div className="kw-chips">
          {scoring.keywords.map((kw) => (
            <span key={kw} className="kw-chip">
              {kw}
              <button
                aria-label={`Remove ${kw}`}
                onClick={() => setScoring({ ...scoring, keywords: scoring.keywords.filter((k) => k !== kw) })}
              >
                <IconX size={12} />
              </button>
            </span>
          ))}
          {adding ? (
            <input
              className="kw-input"
              autoFocus
              value={newKeyword}
              placeholder="new keyword"
              aria-label="New keyword"
              onChange={(e) => setNewKeyword(e.target.value)}
              onBlur={addKeyword}
              onKeyDown={(e) => {
                if (e.key === "Enter") addKeyword();
                if (e.key === "Escape") {
                  setNewKeyword("");
                  setAdding(false);
                }
              }}
            />
          ) : (
            <button className="kw-add" onClick={() => setAdding(true)}>
              <IconPlus size={14} /> Add trigger
            </button>
          )}
        </div>
      </section>

      <p className="t-caps section-gap">Delivery</p>
      <section className="card panel enter" style={{ marginTop: 10 }}>
        <div className="setting-row" style={{ paddingTop: 0 }}>
          <label htmlFor="digest-email">
            Digest & alert email
            <span className="sub">Where the daily digest and email alerts go</span>
          </label>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconMail size={16} style={{ color: "var(--muted)" }} />
            <input
              id="digest-email"
              type="email"
              className="kw-input"
              style={{ width: 220, borderColor: "var(--hairline)" }}
              placeholder="you@example.com"
              value={alerts.email.address}
              onChange={(e) => setAlerts({ ...alerts, email: { ...alerts.email, address: e.target.value } })}
            />
          </span>
        </div>
      </section>

      <p className="t-caps section-gap">Data source health</p>
      <section className="card enter" style={{ marginTop: 10 }}>
        {sources.map((s) => (
          <div key={s.name} className="list-row">
            <span className="list-ico">
              <IconDatabase size={17} />
            </span>
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 15 }}>{s.name}</b>
              <span className="sub t-muted" style={{ display: "block", fontSize: 12.5 }}>
                {s.note}
              </span>
            </div>
            <span style={{ textAlign: "right", fontSize: 13, color: "var(--ink-2)" }}>
              <span className={`dot ${dataSource === "live" ? "dot-ok" : "dot-warn"}`} />{" "}
              {dataSource === "live" ? "Synced" : "Awaiting first sync"}
            </span>
          </div>
        ))}
        <div className="list-row" style={{ background: "var(--surface-low)", borderRadius: "0 0 16px 16px" }}>
          <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
            Deployment: DB {health ? (health.db ? "connected" : "unreachable") : "…"} ·{" "}
            {health?.listingCount ?? 0} listings stored · secrets{" "}
            {health
              ? Object.entries(health.secrets)
                  .map(([k, v]) => `${k.split("_")[0].toLowerCase()} ${v ? "✓" : "✗"}`)
                  .join(", ")
              : "…"}
          </span>
        </div>
      </section>
    </>
  );
}
