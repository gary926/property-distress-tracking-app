import type { Listing } from "../../shared/types";

/** Deterministic placeholder artwork for listing photos — a gradient sky and a
 *  simple skyline/villa silhouette, so the app is fully self-contained until
 *  real portal photos are wired in. */
export function PropertyArt({
  listing,
  className = "",
}: {
  listing: Pick<Listing, "imageHue" | "type">;
  className?: string;
}) {
  const h = listing.imageHue ?? 210;
  const sky = `linear-gradient(180deg, hsl(${h} 65% 88%) 0%, hsl(${(h + 40) % 360} 55% 82%) 55%, hsl(${(h + 70) % 360} 45% 78%) 100%)`;
  const tower = `hsl(${h} 30% 62% / 0.85)`;
  const towerDark = `hsl(${h} 35% 48% / 0.9)`;
  const isVilla = listing.type === "Villa" || listing.type === "Townhouse";

  return (
    <div aria-hidden className={`art-fill ${className}`} style={{ background: sky }}>
      <svg
        viewBox="0 0 400 240"
        preserveAspectRatio="xMidYMax slice"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <circle cx="330" cy="52" r="26" fill="white" opacity="0.55" />
        {isVilla ? (
          <g>
            <rect x="60" y="140" width="120" height="70" rx="4" fill={tower} />
            <polygon points="50,140 120,96 190,140" fill={towerDark} />
            <rect x="210" y="126" width="130" height="84" rx="4" fill={towerDark} />
            <rect x="228" y="150" width="26" height="34" rx="2" fill="white" opacity="0.5" />
            <rect x="270" y="150" width="26" height="34" rx="2" fill="white" opacity="0.5" />
            <rect x="0" y="204" width="400" height="36" fill={`hsl(${(h + 90) % 360} 30% 55% / 0.7)`} />
          </g>
        ) : (
          <g>
            <rect x="48" y="70" width="52" height="170" rx="3" fill={tower} />
            <rect x="112" y="34" width="64" height="206" rx="3" fill={towerDark} />
            <rect x="188" y="88" width="48" height="152" rx="3" fill={tower} />
            <rect x="248" y="52" width="58" height="188" rx="3" fill={towerDark} />
            <rect x="318" y="104" width="44" height="136" rx="3" fill={tower} />
            {[0, 1, 2, 3, 4].map((i) => (
              <rect
                key={i}
                x={120 + (i % 2) * 26}
                y={54 + i * 34}
                width="18"
                height="20"
                rx="1.5"
                fill="white"
                opacity="0.35"
              />
            ))}
          </g>
        )}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgb(0 0 0 / 0.1), transparent)",
        }}
      />
    </div>
  );
}
