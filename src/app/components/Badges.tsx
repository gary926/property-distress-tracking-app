import type { Signal, Tier } from "../../shared/types";
import {
  IconCalendar,
  IconHash,
  IconRefresh,
  IconScale,
  IconTrendDown,
} from "../icons";

const tierLabels: Record<Tier, string> = { hot: "Hot", warm: "Warm", watch: "Watch" };

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className={`tier-pill tier-${tier}`}>
      <i />
      {tierLabels[tier]}
    </span>
  );
}

const signalIcons = {
  price_drop: IconTrendDown,
  below_market: IconScale,
  keyword: IconHash,
  stale: IconCalendar,
  relist: IconRefresh,
} as const;

export function SignalIcons({ signals }: { signals: Signal[] }) {
  return (
    <span className="sig-icons">
      {signals.map((s) => {
        const Icon = signalIcons[s.kind];
        return (
          <span key={s.kind} className="sig-ico" title={s.label}>
            <Icon size={13} strokeWidth={1.75} />
          </span>
        );
      })}
    </span>
  );
}

export function signalIconFor(kind: Signal["kind"]) {
  return signalIcons[kind];
}

const portalColors: Record<string, string> = {
  "Property Finder": "#ef4444",
  Bayut: "#16a34a",
  Dubizzle: "#b91c1c",
};

export function PortalDots({ portals }: { portals: string[] }) {
  return (
    <span className="portal-dots" title={portals.join(" · ")}>
      {portals.map((p) => (
        <span key={p} className="portal-pill">
          <i style={{ background: portalColors[p] ?? "#64748b" }} />
          {p === "Property Finder" ? "PF" : p[0]}
        </span>
      ))}
    </span>
  );
}
