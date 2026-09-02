# UAE Great Deals Dashboard — Feature Plan

A personal tool for spotting great property listings across the UAE, scoring them,
and alerting the owner the moment a good deal appears.

**Owner / sole user:** Garvit (single-user app, no accounts/roles needed in v1)

## Product decisions (agreed 2026-08-29)

- **Data acquisition:** third-party scraping APIs / feeds (Apify actors for Bayut,
  Property Finder, Dubizzle; Firecrawl as fallback) — NOT self-built scrapers.
  Official open data (DLD via Dubai Pulse; DARI/ADREC for Abu Dhabi) supplies
  transaction-based benchmarks.
- **Scope:** All UAE, with emirate as the primary filter. Benchmark quality tiers:
  Dubai (best, DLD transactions), Abu Dhabi (good), other emirates (listing-average only).
- **Users & alerts:** single user; in-app review queue + push notifications + email alerts.
- **Great-deal signals:** price-drop rule, listing-text keywords, days-on-market + relist
  patterns, below building/community average price-per-sqft.

## 1. Data ingestion

- Scheduled sync (every 6–12h) from portal feeds via third-party APIs.
- DLD open-data import for actual transaction prices per building/community (benchmark).
- Cross-portal dedup: merge the same unit listed on multiple portals into one property
  record. A price mismatch between portals for the same unit is itself a signal.
- Price-history snapshots per listing (needed for drop and relist detection).
- Data-source health tracking: last sync, listing counts, error states per source.

## 2. Great-deal engine

Composite **Great Score (0–100)** from weighted signals, all thresholds configurable:

1. **Price drop** > 10% (default) vs original listing price, from price history.
2. **Below benchmark**: price/sqft under the building average (apartments) or community
   average (villas/townhouses); benchmark from DLD transactions where available,
   listing averages elsewhere.
3. **Keywords** in title/description: "urgent sale", "distress", "motivated seller",
   "below original price", "mortgage settlement", "leaving country" (editable list).
4. **Staleness & relists**: 90+ days on market; delist/relist at lower price; repeated
   price cuts.

Severity tiers: **Hot / Warm / Watch**.

## 3. Dashboard

- KPI header: active flagged deals, new since yesterday, avg discount vs market,
  deals in pipeline.
- Deal feed: card grid (photos) + dense table view; sort by score, discount %, freshness.
- Location search: autocomplete search bar for area/community or building/tower name
  (like standard property portals — type "Marina Gate" or "JVC" and get suggestions),
  usable alongside the emirate filter.
- Filters: emirate, community, building, property type, beds, price range, size (sqft),
  portal, score threshold, signal type.
- Deal detail: price-history chart, benchmark comparison (e.g. "AED 950/sqft vs building
  avg 1,180 — 19% below"), signal breakdown with reasons, links to the listing on every
  portal, comparable DLD transactions, agent contact.
- Map view of flagged deals.
- Market analytics: price/sqft trend per community (sanity-check for benchmarks).

## 4. Deal workflow (personal pipeline)

- Statuses: New → Reviewing → Contacted → Negotiating → Closed / Dismissed.
- Watchlist, per-deal notes, dismiss with "never flag this unit again", snooze.
- Saved searches (e.g. "JVC 1-beds under 1M"), each with its own alert rule.

## 5. Alerts

- Instant push notification + email for high-score deals matching a saved search.
- **Daily digest email**: scheduled email (configurable send time) summarizing all new
  great deals captured in the past 24 hours — deal photo, price, drop %, score,
  location, and a link into the dashboard for each.
- Full alert customization, per channel (push vs email independently):
  - which events trigger each channel (new Hot deal, any new flag, price cut on a
    watchlisted deal, saved-search match);
  - minimum score / discount thresholds per channel;
  - frequency: instant, hourly batch, or daily digest only;
  - quiet hours for push notifications.
- Per-saved-search overrides on top of the global alert rules.

## 6. Settings

- Scoring weights, drop threshold, keyword list, staleness cutoff.
- Alert preferences (channels, quiet hours, digest time).
- Data-source health panel.

## Deferred to v2

- Rental-yield / ROI estimates (Ejari rent data).
- Bank auction & foreclosure listings (Emirates Auction).
- WhatsApp alerts.
- CSV export of deal lists.
- AI-generated deal summaries.

## v1 delivery architecture (built 2026-08-29)

- Stack per the `/build-webapp` skill: Cloudflare Pages + D1 + React/Vite;
  single-password auth; JSON-envelope API. See `HANDOFF.md`.
- Live data: Firecrawl scrapes → `POST /api/ingest`; price history accrues in
  D1 so drop/relist detection sharpens over daily runs. Demo snapshot serves
  until the first ingest.
- Alerts (no paid tools): daily scheduled Claude routine — scrape, ingest,
  read `/api/digest`, send Gmail digest + Claude-app push.

## Workflow plan

1. ~~Feature planning~~ (this document)
2. ~~Design prompt for Claude Design~~ → Stitch design delivered (`DESIGN_BRIEF.md`)
3. ~~Build the app from the design~~ (build-webapp skill)
4. Deploy (`cf:setup` → `cf:secrets` → `cf:deploy`), then activate the daily sweep routine
