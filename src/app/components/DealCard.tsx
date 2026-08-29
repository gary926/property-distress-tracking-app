import type { ScoredListing } from "../../shared/types";
import { formatAED } from "../../shared/format";
import { Link } from "../router";
import { useStore } from "../store";
import { ScoreRing } from "./ScoreRing";
import { PortalDots, SignalIcons, TierBadge } from "./Badges";
import { PropertyArt } from "./PropertyArt";
import { IconBed, IconBookmark, IconCalendar, IconRuler } from "../icons";

export function DealCard({ deal, index = 0 }: { deal: ScoredListing; index?: number }) {
  const { dealState, toggleWatchlist } = useStore();
  const watchlisted = dealState[deal.id]?.watchlisted ?? false;
  const originalPrice = deal.priceHistory[0].price;

  return (
    <div className="card deal-card spring enter" style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
      <Link
        to={`/deals/${deal.id}`}
        className="stretch-link"
        aria-label={`${deal.building}, ${formatAED(deal.askingPrice)}, distress score ${deal.score}`}
      />
      <div className="deal-media">
        <PropertyArt listing={deal} className="art" />
        <span className="deal-tier">
          <TierBadge tier={deal.tier} />
        </span>
        <button
          className={`deal-save${watchlisted ? " on" : ""}`}
          aria-label={watchlisted ? "Remove from watchlist" : "Add to watchlist"}
          aria-pressed={watchlisted}
          onClick={() => toggleWatchlist(deal.id)}
        >
          <IconBookmark size={16} strokeWidth={1.75} fill={watchlisted ? "currentColor" : "none"} />
        </button>
        <span className="deal-ring">
          <ScoreRing score={deal.score} size={56} />
        </span>
      </div>

      <div className="deal-body">
        <h3 className="deal-title">
          {deal.building} · {deal.title}
        </h3>
        <p className="deal-loc">
          {deal.community}, {deal.emirate}
        </p>

        <div className="deal-price-row">
          <div>
            <p className="t-caps" style={{ margin: 0 }}>
              Asking price
            </p>
            <div className="deal-price tnum">
              {formatAED(deal.askingPrice)}
              {deal.dropPct >= 1 && <span className="drop">↓{deal.dropPct.toFixed(0)}%</span>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            {deal.dropPct >= 1 && <p className="strike tnum">{formatAED(originalPrice)}</p>}
            {deal.belowMarketPct >= 1 && (
              <span className="below-pill">{deal.belowMarketPct.toFixed(0)}% below market</span>
            )}
          </div>
        </div>

        <div className="deal-meta">
          <span>
            <IconBed size={15} />
            {deal.beds === 0 ? "Studio" : `${deal.beds} Beds`}
          </span>
          <span>
            <IconRuler size={15} />
            {deal.sqft.toLocaleString()} sqft
          </span>
          <span>
            <IconCalendar size={15} />
            {deal.daysOnMarket}d
          </span>
        </div>

        <div className="deal-foot">
          <SignalIcons signals={deal.signals} />
          <PortalDots portals={deal.portals} />
        </div>
      </div>
    </div>
  );
}
