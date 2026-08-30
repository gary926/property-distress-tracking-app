import { useEffect, useState } from "react";
import { useStore } from "../store";
import { api } from "../api";
import { formatAED } from "../../shared/format";
import type { AlertChannelConfig } from "../../shared/types";
import {
  IconBookmark,
  IconMail,
  IconPhoneDevice,
  IconPlus,
  IconSend,
} from "../icons";

interface DigestPreview {
  subject: string;
  recipient: string | null;
  deals: {
    id: string;
    title: string;
    location: string;
    price: number;
    score: number;
    dropPct: number;
    belowMarketPct: number;
  }[];
}

const eventRows: { key: keyof AlertChannelConfig & string; label: string; sub: string }[] = [
  { key: "newHotDeal", label: "New Hot deal", sub: "Score crosses the Hot tier" },
  { key: "anyNewFlag", label: "Any new flag", sub: "Every newly captured deal" },
  { key: "watchlistPriceCut", label: "Watchlist price cut", sub: "A saved deal drops again" },
  { key: "savedSearchMatch", label: "Saved-search match", sub: "New match for a search below" },
];

export function Saved() {
  const { savedSearches, setSavedSearches, alerts, setAlerts } = useStore();
  const [digest, setDigest] = useState<DigestPreview | null>(null);

  useEffect(() => {
    api<DigestPreview>("/api/digest").then(setDigest).catch(() => {});
  }, []);

  function toggleSearch(id: string, field: "enabled" | "push" | "email" | "digest") {
    setSavedSearches(
      savedSearches.map((s) => {
        if (s.id !== id) return s;
        if (field === "enabled") return { ...s, enabled: !s.enabled };
        return { ...s, channels: { ...s.channels, [field]: !s.channels[field] } };
      }),
    );
  }

  function patchChannel(channel: "push" | "email", patch: Partial<AlertChannelConfig>) {
    setAlerts({ ...alerts, [channel]: { ...alerts[channel], ...patch } });
  }

  return (
    <>
      <header className="page-head">
        <div className="glow-header" />
        <h1 className="t-headline-lg">Saved searches & alerts</h1>
        <p>Manage your great-deal criteria and how the radar reaches you.</p>
      </header>

      {/* Saved searches */}
      <section className="card section-gap enter">
        {savedSearches.map((s) => (
          <div key={s.id} className="list-row">
            <span className="list-ico">
              <IconBookmark size={18} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 15.5 }}>{s.name}</b>
              <span className="sub t-muted" style={{ display: "block", fontSize: 12.5 }}>
                Created {s.created} · alert at score ≥ {s.minScore}
              </span>
              <div className="crit-chips">
                {s.criteria.map((c) => (
                  <span key={c} className="crit-chip">
                    {c}
                  </span>
                ))}
                {(["push", "email", "digest"] as const).map((ch) => (
                  <button
                    key={ch}
                    className="crit-chip"
                    style={
                      s.channels[ch]
                        ? { background: "rgb(216 226 255 / 0.6)", color: "var(--primary)" }
                        : { opacity: 0.6 }
                    }
                    onClick={() => toggleSearch(s.id, ch)}
                    aria-pressed={s.channels[ch]}
                  >
                    {ch === "push" ? "Push" : ch === "email" ? "Email" : "Digest"}
                    {s.channels[ch] ? " ✓" : ""}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="checkbox"
              className="switch"
              checked={s.enabled}
              onChange={() => toggleSearch(s.id, "enabled")}
              aria-label={`Enable ${s.name}`}
            />
          </div>
        ))}
        <div className="list-row">
          <button className="kw-add">
            <IconPlus size={15} /> New saved search — set filters on the dashboard, then save them here
          </button>
        </div>
      </section>

      {/* Channel customization */}
      <h2 className="t-headline-md section-gap">Alert delivery</h2>
      <div className="channel-grid" style={{ marginTop: 14 }}>
        {(
          [
            ["push", "Push notifications", <IconPhoneDevice key="p" size={18} />, "Instant alerts on your phone"],
            ["email", "Email", <IconMail key="e" size={18} />, alerts.email.address || "Set your address in Settings"],
          ] as const
        ).map(([channel, title, icon, sub]) => {
          const cfg = alerts[channel];
          return (
            <section key={channel} className="card panel enter">
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                <span className="list-ico">{icon}</span>
                <div>
                  <b style={{ fontSize: 15.5 }}>{title}</b>
                  <span className="sub t-muted" style={{ display: "block", fontSize: 12.5 }}>
                    {sub}
                  </span>
                </div>
              </div>

              {eventRows.map((row) => (
                <div key={row.key} className="setting-row">
                  <label htmlFor={`${channel}-${row.key}`}>
                    {row.label}
                    <span className="sub">{row.sub}</span>
                  </label>
                  <input
                    id={`${channel}-${row.key}`}
                    type="checkbox"
                    className="switch"
                    checked={Boolean(cfg[row.key as keyof AlertChannelConfig])}
                    onChange={() =>
                      patchChannel(channel, {
                        [row.key]: !cfg[row.key as keyof AlertChannelConfig],
                      } as Partial<AlertChannelConfig>)
                    }
                  />
                </div>
              ))}

              <div className="slider-row">
                <div className="head">
                  <span>Minimum score</span>
                  <b className="tnum">{cfg.minScore}</b>
                </div>
                <input
                  type="range"
                  min={0}
                  max={95}
                  step={5}
                  value={cfg.minScore}
                  className="slider"
                  aria-label={`${title} minimum score`}
                  style={{ ["--fill" as string]: `${(cfg.minScore / 95) * 100}%` }}
                  onChange={(e) => patchChannel(channel, { minScore: Number(e.target.value) })}
                />
              </div>
              <div className="slider-row">
                <div className="head">
                  <span>Minimum discount</span>
                  <b className="tnum">{cfg.minDiscount}%</b>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  value={cfg.minDiscount}
                  className="slider"
                  aria-label={`${title} minimum discount`}
                  style={{ ["--fill" as string]: `${(cfg.minDiscount / 30) * 100}%` }}
                  onChange={(e) => patchChannel(channel, { minDiscount: Number(e.target.value) })}
                />
              </div>

              <div className="setting-row">
                <label>Frequency</label>
                <div className="stepper" style={{ flex: "0 1 auto" }}>
                  {(["instant", "hourly", "digest"] as const).map((f) => (
                    <button
                      key={f}
                      className={cfg.frequency === f ? "active" : ""}
                      onClick={() => patchChannel(channel, { frequency: f })}
                    >
                      {f === "instant" ? "Instant" : f === "hourly" ? "Hourly" : "Digest"}
                    </button>
                  ))}
                </div>
              </div>

              {channel === "push" && (
                <div className="setting-row">
                  <label>
                    Quiet hours
                    <span className="sub">
                      {alerts.push.quietHours.from} – {alerts.push.quietHours.to}
                    </span>
                  </label>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="time"
                      className="time-pill"
                      value={alerts.push.quietHours.from}
                      aria-label="Quiet hours start"
                      onChange={(e) =>
                        setAlerts({
                          ...alerts,
                          push: { ...alerts.push, quietHours: { ...alerts.push.quietHours, from: e.target.value } },
                        })
                      }
                    />
                    <input
                      type="checkbox"
                      className="switch"
                      checked={alerts.push.quietHours.enabled}
                      aria-label="Enable quiet hours"
                      onChange={() =>
                        setAlerts({
                          ...alerts,
                          push: {
                            ...alerts.push,
                            quietHours: { ...alerts.push.quietHours, enabled: !alerts.push.quietHours.enabled },
                          },
                        })
                      }
                    />
                  </span>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Daily digest */}
      <section className="card panel section-gap enter">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="list-ico">
            <IconSend size={18} />
          </span>
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 15.5 }}>Daily digest email</b>
            <span className="sub t-muted" style={{ display: "block", fontSize: 12.5 }}>
              Everything the radar captured in the past 24 hours, delivered on schedule.
            </span>
          </div>
          <input
            type="time"
            className="time-pill"
            value={alerts.digest.time}
            aria-label="Digest delivery time"
            onChange={(e) => setAlerts({ ...alerts, digest: { ...alerts.digest, time: e.target.value } })}
          />
          <select
            className="select-pill"
            value={alerts.digest.frequency}
            aria-label="Digest frequency"
            onChange={(e) =>
              setAlerts({ ...alerts, digest: { ...alerts.digest, frequency: e.target.value as "daily" | "weekly" } })
            }
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          <input
            type="checkbox"
            className="switch"
            checked={alerts.digest.enabled}
            aria-label="Enable daily digest"
            onChange={() => setAlerts({ ...alerts, digest: { ...alerts.digest, enabled: !alerts.digest.enabled } })}
          />
        </div>

        <div className="digest-preview" style={{ marginTop: 16 }}>
          <b>{digest?.subject ?? "Digest preview"}</b>
          {digest && digest.deals.length === 0 && (
            <p className="t-muted" style={{ margin: 0 }}>
              Nothing new in the last 24 hours — the radar stays quiet when there’s nothing worth your time.
            </p>
          )}
          {digest?.deals.map((d) => (
            <div key={d.id} className="digest-row">
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {d.title} · <span className="t-muted">{d.location}</span>
              </span>
              <span className="tnum" style={{ flexShrink: 0 }}>
                {formatAED(d.price)}
                {d.dropPct >= 1 && <span style={{ color: "var(--error)" }}> ↓{d.dropPct}%</span>}
                <b className="grad-text" style={{ marginLeft: 8 }}>{d.score}</b>
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
