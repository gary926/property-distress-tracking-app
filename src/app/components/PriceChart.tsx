import { useEffect, useRef, useState } from "react";
import type { PricePoint } from "../../shared/types";
import { formatAED, formatDate } from "../../shared/format";

/** Hand-rolled SVG price-history chart: gradient 2px line with soft area fill,
 *  a dashed market-value reference, and a crosshair tooltip. Renders at the
 *  container's real pixel width so labels stay legible. */
export function PriceChart({ history, fairValue }: { history: PricePoint[]; fairValue: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const height = 220;
  const pad = { top: 16, right: 16, bottom: 26, left: 8 };
  const narrow = width < 420;

  const times = history.map((p) => new Date(p.date + "T00:00:00").getTime());
  const prices = history.map((p) => p.price);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const minP = Math.min(...prices, fairValue) * 0.97;
  const maxP = Math.max(...prices, fairValue) * 1.02;

  const x = (t: number) =>
    pad.left + ((t - minT) / Math.max(maxT - minT, 1)) * (width - pad.left - pad.right);
  const y = (p: number) =>
    pad.top + (1 - (p - minP) / Math.max(maxP - minP, 1)) * (height - pad.top - pad.bottom);

  const pts = history.map((p, i) => ({ px: x(times[i]), py: y(p.price), ...p }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].px.toFixed(1)},${height - pad.bottom} L${pts[0].px.toFixed(1)},${height - pad.bottom} Z`;

  const gridPrices = [minP + (maxP - minP) * 0.15, (minP + maxP) / 2, maxP - (maxP - minP) * 0.15];

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let nearest = 0;
    let best = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(p.px - mx);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHover(nearest);
  }

  const h = hover !== null ? pts[hover] : null;
  const dropFromFirst = h ? ((history[0].price - h.price) / history[0].price) * 100 : 0;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Price history from ${formatAED(history[0].price)} to ${formatAED(history[history.length - 1].price)}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        style={{ display: "block", cursor: "crosshair" }}
      >
        <defs>
          <linearGradient id="pc-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="55%" stopColor="var(--secondary)" />
            <stop offset="100%" stopColor="var(--tertiary)" />
          </linearGradient>
          <linearGradient id="pc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridPrices.map((gp) => (
          <g key={gp}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(gp)}
              y2={y(gp)}
              stroke="var(--hairline)"
              strokeWidth="1"
            />
            <text
              x={width - pad.right}
              y={y(gp) - 4}
              textAnchor="end"
              fontSize={narrow ? 10 : 11}
              fill="var(--muted)"
            >
              {formatAED(gp)}
            </text>
          </g>
        ))}

        {/* Market-value reference */}
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={y(fairValue)}
          y2={y(fairValue)}
          stroke="var(--pos)"
          strokeWidth="1.5"
          strokeDasharray="5 5"
          opacity="0.7"
        />
        <text x={pad.left + 2} y={y(fairValue) - 5} fontSize={narrow ? 10 : 11} fill="var(--pos)" fontWeight="600">
          Market value {formatAED(fairValue)}
        </text>

        <path d={area} fill="url(#pc-fill)" />
        <path d={line} fill="none" stroke="url(#pc-line)" strokeWidth="2" strokeLinecap="round" />

        {pts.map((p, i) => (
          <g key={p.date}>
            <circle
              cx={p.px}
              cy={p.py}
              r={hover === i ? 6 : 4}
              fill="var(--surface)"
              stroke="var(--secondary)"
              strokeWidth="2"
            />
            {!narrow && i > 0 && (
              <text x={p.px} y={p.py - 12} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--error)">
                ↓{(((history[i - 1].price - p.price) / history[i - 1].price) * 100).toFixed(0)}%
              </text>
            )}
          </g>
        ))}

        {h && (
          <line x1={h.px} x2={h.px} y1={pad.top} y2={height - pad.bottom} stroke="var(--outline-var)" strokeWidth="1" strokeDasharray="3 3" />
        )}

        <text x={pad.left} y={height - 8} fontSize={narrow ? 10 : 11} fill="var(--muted)">
          {formatDate(history[0].date)}
        </text>
        <text x={width - pad.right} y={height - 8} textAnchor="end" fontSize={narrow ? 10 : 11} fill="var(--muted)">
          {formatDate(history[history.length - 1].date)}
        </text>
      </svg>

      {h && (
        <div className="chart-tip" style={{ left: h.px, top: h.py }}>
          <b>{formatAED(h.price, false)}</b>
          <br />
          {formatDate(h.date)}
          {dropFromFirst >= 1 && <> · ↓{dropFromFirst.toFixed(1)}% from listing</>}
        </div>
      )}
    </div>
  );
}
