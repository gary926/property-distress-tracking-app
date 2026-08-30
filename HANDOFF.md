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

## The daily sweep

**Live as of 2026-08-30**: scheduled Claude routine "Distress Radar — daily UAE
sweep (08:00 Gulf)", `trig_012q6gKm7um8H2sYQuuDxv2y`, cron `0 4 * * *` (04:00
UTC = 08:00 Gulf), fresh session per firing, completion push on.

Two things it depends on that do not live in this repo:

- **Connectors.** The routine needs Firecrawl and Gmail attached. Triggers
  created through the MCP tool cannot carry connectors on this account, so they
  were attached by hand in claude.ai → Routines. If a run reports "no
  Firecrawl/Gmail connectors attached", that is what came adrift.
- **The INGEST_TOKEN**, which lives in the routine's prompt and in Cloudflare
  (`npm run cf:secrets`). Rotating it means changing it in both. It is
  deliberately not written down in this repo.

The routine checks out `claude/uae-distress-deals-dashboard-j3184x`, because
`main` is still the initial commit. Merge that branch and this step can go.

The job it runs:

1. **Scrape** each portal area page with `firecrawl_scrape`, `formats: ["json"]`,
   extracting title, building, community, emirate, price AED, beds, baths,
   sqft, listing URL, and urgency phrases. Verified working (2026-08-29):
   - `https://www.bayut.com/for-sale/apartments/dubai/<area>/`
   - `https://www.propertyfinder.ae/en/search?c=1&l=<locId>&t=1&ob=nd`
     (`ob=nd` = newest first; reduction phrases show up in titles)
   Costs ~5 credits per page. **Bayut's `?q=` param does not filter** — it
   silently returns the generic listing page, so don't try keyword search;
   scrape area pages and let the scoring engine find the signals.
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
3. **Enrich — this is where the real benchmarks come from.**
   Search pages carry no averages. The *listing detail page* does, under
   "Trends & Indices": an average AED/sqft for the area AND a per-building
   table, both already banded by bedroom count, plus recent transactions in
   the same building. Scrape with `formats: ["markdown"]`,
   `onlyMainContent: false`, `includeTags: ["table","svg"]`,
   `excludeTags: ["img","picture","nav","footer","a","aside"]`,
   `waitFor: 5000`, `maxAge: 0`. All five matter:
   - the trends block is rendered by JS, so without `waitFor` those sections
     come back **empty** and a cache hit can serve the JS-less version;
   - the area average lives in an SVG, so excluding `svg` silently drops it;
   - `includeTags` cuts the page to ~1 KB, and markdown costs **1 credit**
     where a `json`/`query` extraction of the same page costs 5.

   Save each page as `seed/detail-pages/<listing id>.md`, then
   `node scripts/parse-detail-page.mjs seed/detail-pages listings.json`.

   **You do not need a page per listing.** The published figures are per area
   *and bedroom band*, so one page benchmarks every listing in its band.
   `node scripts/parse-detail-page.mjs --plan listings.json` prints the
   cheapest set: 23 pages covered all 54 listings in the first sweep.

   What it yields, and what it does not: the per-building table lists the five
   most-searched *locations* in that band, which are towers in Dubai Marina and
   Business Bay but sub-districts in JVC and Al Reem. So a building average
   only lands when a listing's own tower is in that table — 9 of 54 on the
   first sweep. That is the honest ceiling of what Bayut publishes, and the
   detail screen says "Not available" rather than substituting the area figure.
   Same-building *transactions* are captured too, but as comps, never as the
   benchmark: those are settled prices and the listing is an asking price, so
   folding them together would bias every score.

   Property Finder publishes the same building-vs-area comparison, but only as
   a plotted chart — the values are not in the page text, so nothing is
   extractable there beyond its transactions table.

4. **Ingest**: `APP_URL=… INGEST_TOKEN=… node scripts/ingest.mjs listings.json`
5. **Deliver**: `GET <APP_URL>/api/digest` — if `deals` is non-empty, email it
   to the configured recipient via Gmail and send a phone push with the count
   and top deal.

The routine needs three values: the live APP_URL (read from the deploy
output), the INGEST_TOKEN, and the digest recipient (set in app Settings).

**Expect low scores on day one.** A first sweep has no price history and no
days-on-market, so only the below-market and keyword signals can fire (max 50
of 100). Price-drop (35) and staleness (15) accrue as the sweep repeats — the
radar gets sharper every day it runs, and Hot deals appear once listings have
been observed dropping.

## Deployment state (2026-08-30)

- **Live D1 backfilled** with the two-benchmark shape: all 54 rows carry
  `listingType: "sale"` and a portal-published `areaPsf`, 9 carry a real
  `buildingPsf`, and the legacy `benchmarkPsf` is gone. The app picks this up
  on the next deploy — no re-ingest needed for it. Re-ingesting
  `seed/first-sweep.json` additionally replaces the synthetic comps with the
  real same-building transactions the enrichment captured.
- `seed/detail-pages/` holds the 22 trimmed detail-page transcripts the
  benchmarks were read from, so the parse is reproducible offline.

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

## Benchmark scoping — two traps the first live run walked into

Both were found on 2026-08-30 by running the pipeline against live pages, and
both would have manufactured false "below market" flags rather than failing
loudly. Tests cover them; read this before touching `parse-detail-page.mjs`.

- **The chart's label lies about its scope.** It always says "for other N Beds
  apartments in <community>", but the figure is scoped to whatever location
  Bayut filed the listing under. On the same day, for Dubai Marina 2-beds,
  Cayan Tower and DAMAC Heights both reported 2,079 while Marina Gate 2
  reported 3,105 — exactly its own row in the per-location table, because it
  sits in the "Marina Gate" sub-development. Propagating that across the band
  would have marked every other 2-bed roughly a third below market. The
  parser now treats a figure that coincides with a named location row as that
  location's, and only a community-scoped figure benchmarks a whole band.
- **Loose name matching.** The per-location table is ranked, so rows arrive as
  "1 Horizon Tower" and the rank is stripped at parse time. Stripping a number
  *again* in the matcher turned the real tower "23 Marina" into "marina",
  which substring-matched most of the community — "ARY Marina View" was handed
  23 Marina's average. Matching is now whole-word, and the shorter name has to
  be at least two words or eight characters.

A corollary worth keeping: what the per-location table names is often the
*development* (Al Habtoor City, JVC District 11), not the tower. `buildingPsf`
therefore travels with `buildingPsfLabel` naming what was actually matched, and
the detail screen says "Same development" rather than pretending it is the
tower's own figure.

## Gotchas already hit

- **The app's own domain is blocked from the Claude session's egress proxy.**
  `distress-radar.pages.dev` returns 403 on CONNECT, so a session cannot call
  `/api/ingest` or `/api/digest` — the two HTTP hops in the sweep. Writing to
  D1 through the Cloudflare connector works and is how the first two loads were
  done. Fixing this properly means allowing the host in the environment's
  network policy; until then the routine cannot complete steps 4 and 5.

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
