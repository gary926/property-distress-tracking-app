# Distress Radar — Design Brief

Visual direction agreed 2026-08-29. This is the prompt given to Claude Design; the
resulting design will drive the build. Keep the build faithful to this direction.

## Visual direction

- **Apple-level minimalism**, extremely modern: light theme, near-white background with
  a subtle cool grey-blue tint, pure white cards, large corner radii (16–20px), soft
  diffused shadows, generous whitespace, hairline borders at most.
- **Gemini color language**: signature blue → indigo → violet gradient used sparingly —
  primary buttons, Distress Score ring, active filter chips, one ambient header glow.
  Soft glow/bloom behind key elements.
- **Typography**: SF Pro / Inter feel; large light-weight numerals for KPIs, tight
  letter-spacing, strong hierarchy.
- **Icons**: thin rounded SF-Symbols-style line icons, used instead of text labels
  where possible.
- **Motion**: subtle micro-animations — cards lift on hover, numbers count up, score
  ring fills, chips spring on toggle, new deals fade/slide in. Smooth, never flashy.
- **Semantic colors stay quiet**: Hot / Warm / Watch tiers as small dots or soft tinted
  pills (red / amber / grey-blue); blue gradient family dominates.
- Desktop-first, responsive; AED currency formatting throughout.
- Overall feeling: calm, premium, luminous.

## Screens

1. **Main dashboard** — greeting header with ambient gradient wash; a prominent
   rounded location search bar with autocomplete (type an area or building name —
   "Marina Gate", "JVC" — and get grouped suggestions: Areas / Buildings, with icons);
   4 KPI cards (Active Flagged Deals, New Today, Avg. Discount vs Market, Deals in
   Pipeline); pill-chip filter bar with prominent emirate segmented control +
   community, type, beds, price, score-threshold gradient slider; deal feed with
   card/table toggle and map-view toggle. Deal cards: photo, circular gradient score ring (0–100), price with
   drop ("AED 1.15M ↓14%"), price/sqft vs building avg, beds/size/community icons,
   fired-signal icons, portal favicons, days on market.
2. **Deal detail** — gallery, icon key facts, gradient-filled price-history chart,
   benchmark module with DLD comps table, "Why this was flagged" signal cards with score
   contributions, portal links, agent contact, pipeline segmented stepper
   (New → Reviewing → Contacted → Negotiating → Closed/Dismissed), notes, watchlist,
   snooze, never-flag.
3. **Saved searches & alerts** — saved-search cards with iOS-style toggles for
   push / email / daily digest and per-search thresholds; an alert-customization
   section with independent Push and Email columns (which events fire each channel:
   new Hot deal, any new flag, watchlist price cut, saved-search match; min
   score/discount sliders; frequency: instant / hourly batch / digest only; quiet
   hours for push); a Daily Digest card with an iOS-style time picker for send time
   and a small email preview thumbnail (past-24h deals list).
4. **Settings** — Apple-Settings grouped cards: scoring weight sliders, price-drop
   threshold (default 10%), editable keyword chips, staleness cutoff, data-source
   health panel (status dots, last sync, listing counts per portal).
