# HANDOFF — Distress Radar

Read this first when picking the project up. It records the decisions made with
Garvit and how the moving parts fit.

## Decisions (agreed 2026-08-29)

- **Stack** follows the `/build-webapp` skill exactly: Cloudflare Pages +
  bundled worker, D1, React/Vite, hand-rolled router/charts/icons, one CSS
  file, runtime deps = react + react-dom only. Inter is **self-hosted**
  (`public/fonts/`), no Google Fonts at runtime.
- **v1 data**: live scraping via **Firecrawl** feeding `/api/ingest`; the
  bundled demo snapshot serves until the first ingest lands. No paid data
  feeds. Price history accrues in `price_points` across daily ingests — the
  price-drop/relist signals get sharper the longer the sweep runs.
- **Alerts, no paid tools**: a **daily scheduled Claude routine** (included in
  the Claude subscription) does the sweep and delivery — scrape → ingest →
  read `/api/digest` → email via Garvit's **Gmail connector** + push via the
  Claude app notification. Make/Zapier remain drop-in alternatives for the
  email leg (Garvit already runs Make sender scenarios). Web Push (VAPID) was
  deliberately skipped in v1.
- Scheduled work cannot run inside a Pages worker (no cron on Pages), which is
  why the sweep lives outside the app.

## Layout

- `src/shared/` — types, scoring engine, filters, formatters, demo snapshot.
  Shared by worker, frontend, and the fixtures server. Framework-free.
- `src/worker/` — route table (`index.ts`), auth (`auth.ts`: password login,
  HMAC cookie, sessions + rate limit in D1), data (`data.ts`: listings/ingest/
  state/digest). Every response is `{ok, data|error}` via `http.ts` — an
  architecture test enforces this.
- `src/app/` — React app. `router.tsx` (history API), `store.tsx` (loads
  `/api/listings` + `/api/state`, optimistic writes back), `icons.tsx`
  (hand-rolled), `app.css` (the whole design system), `screens/`, `components/`.
- `db/schema.sql` — sessions, login_attempts, deal_state, settings (JSON docs
  keyed `alerts`/`scoring`/`saved_searches`), listings, price_points.
- `scripts/` — build, cloudflare wrappers, fixtures preview, ingest pusher.

## Scoring

`scoreListing` in `src/shared/scoring.ts`: four weighted, independently
saturating components (price drop vs original, psf below benchmark, keyword
hits, staleness/relists), capped at 99. Tiers: hot ≥70, warm ≥45. Weights,
threshold, keywords, and staleness cutoff are user-tunable in Settings and
stored in D1; the worker's digest uses the same stored settings.

## The daily sweep (to activate after first deploy)

Create a scheduled Claude routine (fresh session, daily ~04:00 UTC = 08:00
UAE) with Firecrawl + Gmail connectors and this job:

1. **Scrape** each portal area page with `firecrawl_scrape`, `formats: ["json"]`,
   extracting title, building, community, emirate, price AED, beds, baths,
   sqft, listing URL, and urgency phrases. Verified working (2026-08-29):
   - `https://www.bayut.com/for-sale/apartments/dubai/<area>/`
   - `https://www.propertyfinder.ae/en/search?c=1&l=<locId>&t=1&ob=nd`
     (`ob=nd` = newest first; reduction phrases show up in titles)
   Costs ~5 credits per page. **Bayut's `?q=` param does not filter** — it
   silently returns the generic listing page, so don't try keyword search;
   scrape area pages and let the scoring engine find the signals.
1b. **Enrich (optional but this is where the good benchmarks come from).**
   Search pages carry no averages. The *listing detail page* does — verified
   2026-08-29 on `bayut.com/property/details-16083937.html`, which publishes
   "Average AED/sqft for DAMAC Heights: 1,500" and "for Dubai Marina area:
   1,200". Scrape detail pages for the listings you care about, asking for
   `buildingAveragePricePerSqft` and `areaAveragePricePerSqft` (the transform
   reads exactly those names and prefers them over anything it computes).
   **Costs ~5 credits per listing**, so enrich selectively — the top-scoring
   listings, or ones whose price just moved — not the whole batch.
2. **Transform**: `node scripts/transform-listings.mjs raw.json > listings.json`
   — maps loose extraction fields to the `Listing` shape, detects distress
   keywords, drops any rental, and derives **two** benchmarks per listing:
   `buildingPsf` (same tower) and `areaPsf` (surrounding community). Published
   portal figures win; otherwise each is a bed-banded median over the batch
   needing 3+ comparables. Bed banding is load-bearing — an unbanded average
   flags every large unit as "below market" purely because big units carry
   lower psf.

   **Sale-only.** v1 tracks sales; rentals are v2. The transform rejects them
   (rental URL paths, an explicit price-period field, "for rent"/"to let" in
   the title) and `/api/ingest` rejects any row not marked `listingType:
   "sale"`. One rental in a group would sit ~2 orders of magnitude below the
   sale prices and poison every psf benchmark there. Note the filter must NOT
   match period words in titles: UAE sale listings advertise instalment plans
   ("1% MONTHLY PAYMENT PLAN"), and matching "monthly" there drops real deals.
3. **Ingest**: `APP_URL=… INGEST_TOKEN=… node scripts/ingest.mjs listings.json`
4. **Deliver**: `GET <APP_URL>/api/digest` — if `deals` is non-empty, email it
   to the configured recipient via Gmail and send a phone push with the count
   and top deal.

The routine needs three values: the live APP_URL (read from the deploy
output), the INGEST_TOKEN, and the digest recipient (set in app Settings).

**Expect low scores on day one.** A first sweep has no price history and no
days-on-market, so only the below-market and keyword signals can fire (max 50
of 100). Price-drop (35) and staleness (15) accrue as the sweep repeats — the
radar gets sharper every day it runs, and Hot deals appear once listings have
been observed dropping.

## Deployment state (2026-08-29)

- **D1 provisioned**: `distress-radar-db`, uuid `f86f5a2f-c231-4ff3-8e41-c5edaaaf2f21`,
  primary region WEUR (closest D1 offers to the UAE), schema applied, all six
  tables verified. `wrangler.toml` points at it.
- **Pages project created and first deploy done** — but it landed as a *preview*
  deployment (feature branch checked out), so it had no production secrets and
  login failed. Fixed by pinning `cf:deploy` to `--branch main`; a redeploy is
  needed to land it on production.
- **Firecrawl verified working** against Bayut and Property Finder on
  2026-08-29; the scrape → transform → ingest → score chain was run end to end
  on 16 real Dubai Marina listings against local D1.

## Gotchas already hit

- **Pages preview vs production is the one that bit us.** `wrangler pages deploy`
  infers the branch from git. Deploying while on a feature branch creates a
  *preview* deployment on a hashed subdomain (`<hash>.<project>.pages.dev`),
  leaves `<project>.pages.dev` serving nothing, and — because `pages secret put`
  is production-scoped — gives that preview no APP_PASSWORD, so login fails with
  "not set". `cf:deploy` now always passes `--branch main` so this cannot recur.

- Pages binds secrets at deploy time — always redeploy after `cf:secrets`.
- Same-day price changes upsert into `price_points` (PK listing_id+date).
- `wrangler pages dev` reads `.dev.vars` (gitignored) for local secrets.
- The fixtures server (`npm run preview`) is the fastest way to see the UI —
  signed-in, demo data, in-memory state.
- Playwright + Chromium are preinstalled in Claude remote sessions
  (`NODE_PATH=/opt/node22/lib/node_modules`); PNG icons were rendered from
  `public/icons/icon.svg` that way.
