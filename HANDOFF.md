# HANDOFF — Great Radar

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

**Live as of 2026-08-30**: scheduled Claude routine "Great Radar — daily UAE
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

The app now lives on `main` (merged 2026-09-12), so a session no longer has
to check out a feature branch to find it. The routine's prompt still tells it
to check out `claude/uae-distress-deals-dashboard-j3184x`; that branch is
merged and kept in step with `main`, so the instruction still works, but it
can be dropped from the prompt whenever the routine is next edited.

**Where a scheduled sweep's commits land is not its own choice.** Each
scheduled session is assigned a `claude/determined-ride-*` branch and told to
develop on it, so sweep work — refreshed benchmark transcripts, and any fix
the sweep makes — lands there rather than on the branch the next sweep checks
out. Two sweeps' worth of work sat stranded that way before being merged on
2026-09-12. If a sweep reports a fix, check whether it is actually on the
branch the next run will read, and merge it across if not.

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
   — maps loose extraction fields to the `Listing` shape, detects great-deal
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

   **Two plans, and the choice is a budget decision.**
   `--plan` gives one page per (community, bedroom band) — 23 pages for the
   first sweep's 54 listings, because the published averages are per band.
   `--plan --per-listing` gives one page per listing (~1 credit each) and buys
   two things a band plan cannot: every listing's own building sale figures,
   and the band average decided by a vote across pages instead of one reading.
   See "Per-listing enrichment" below.

   What it yields, and what it does not: the per-building table lists the five
   most-searched *locations* in that band, which are towers in Dubai Marina and
   Business Bay but sub-districts in JVC and Al Reem. So a building average
   only lands when a listing's own tower is in that table — 9 of 54 on the
   first sweep. That is the ceiling of *that table*, not of the portals (an
   earlier note in this file claimed otherwise; see "Property Finder is the
   better benchmark" below). The detail screen says "Not available" rather than
   substituting the area figure. Same-building *transactions* are captured too,
   but as comps, never as the benchmark: those are settled prices and the
   listing is an asking price, so folding them together would bias every score.

   **Property Finder pages parse differently and are preferred.** Same cost,
   same `formats: ["markdown"]`, but `includeTags: ["table","p"]` — the `p` is
   load-bearing, because PF states its averages in prose, not in an SVG.
   Firecrawl hoists every table to the top of the markdown, away from the
   caption naming it, so the tables are identified by their header alone:
   `| Date | AED | ...` is the sold table and `| Date | AED/year | ...` the
   rented one. `parseDetailPage` detects the portal and dispatches; the Bayut
   path is untouched.

4. **Ingest**: `APP_URL=… INGEST_TOKEN=… node scripts/ingest.mjs listings.json`
   Then keep the day's enriched batch as `seed/sweeps/<YYYY-MM-DD>.json` and
   commit it. `raw.json`, `listings.json` and `enriched.json` are gitignored
   scratch — they are overwritten every run, so tracking them would rewrite
   the same diff daily and keep nothing. The dated snapshot accumulates
   instead, and is the same bare-array shape as `seed/first-sweep.json`, so
   `npm run score -- --data seed/sweeps/<date>.json` rescores any past day
   against today's weights.
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

## The sweep cannot currently produce a deal (found 2026-11-04)

This is the most important thing in this file. Read it before refreshing
benchmarks again, because no amount of benchmark work fixes it.

Measured against live D1 on 2026-11-04: **962 listings, 966 price points.**
958 of the 962 have exactly *one* price point; only 4 have ever had a second.

The cause is the scrape target. Every sweep fetches each area's search page
with `ob=nd` — newest first — and takes the ~10 cards on page one. A week
later, page one is ten *different* brand-new listings. So the sweep has never
re-observed a listing it had seen before, which means:

- **price-drop (35 points) can never fire** — it needs the same listing
  observed at two prices;
- **staleness/relist (15 points) can never fire** — it needs days-on-market.

That caps every listing at belowMarket (30) + keyword (20) = **50**, and
`buildDigest` filters on `score >= minScore` with `minScore` defaulting to
**50**. A listing would have to max *both* surviving components simultaneously
to tie the threshold. Today's batch of 87 topped out at **28**.

So `/api/digest` has almost certainly returned zero deals on every run since
launch, and will keep doing so. This is NOT the documented "expect low scores
on day one" effect — that one resolves itself as history accrues. This one
never resolves, because history never accrues.

**The missing half of the pipeline is re-pricing what is already tracked.**
The listing URLs are already in D1. A fix means fetching the current price of
listings already stored (so `price_points` gains a second row and a drop can be
seen) rather than only discovering new ones. That is a design decision with a
credit cost — roughly one scrape per tracked listing per run on top of
discovery — and a sweep should not make it unilaterally, so it is left to
Garvit. Lowering `minScore` would only paper over it: with no price history the
scores are measuring half the signal set.

Also worth checking: ingests land **weekly**, not daily. `first_seen` values are
2026-08-29/30/31 then every seventh day — 09-02, 09-09, 09-16, 09-23, 09-30,
10-07, 10-14, 10-21, 10-28, 11-04 — i.e. 13 ingests in 67 days. The routine's
cron is recorded above as `0 4 * * *` (daily), so either the schedule is not
what this file says or six of every seven runs are not reaching `/api/ingest`.

## Never trust the search-card extraction for a listing's own numbers (2026-11-04)

The search-results scrape is an LLM `formats: ["json"]` extraction over a grid
of cards, and it **misaligns a card's attributes with that card's URL**. Found
live on 2026-11-04:

- Al Reem Island: the Mayar and Radiant Marina Towers cards had each other's
  price and size (3,235,020 / 2,205 sqft against the wrong URL of the two).
- Tilal City: the *whole page* was shifted by one row — card N's price, size
  and title belonged to the listing before it. Four of ten checked were wrong.
- Scattered single-field errors elsewhere: Marina Heights read as a 2-bed when
  its page says 1 Bed, Radiant Garden Towers as a 2-bed when it is a 1-bed.

A one-row shift is the worst failure this project has: it pairs one unit's
price with another unit's size, which fabricates a psf and therefore a fake
"below market" flag — the exact class of error the benchmark-scoping work
exists to prevent. It is also completely silent.

**The URL is the only self-identifying field on a card** (it carries the listing
id). So the search page is now used *only* to enumerate which listings exist,
and every value that feeds a psf — title, price, beds, baths, sqft, type,
building — is read from that listing's own detail page, where it sits under a
label. `scripts/raw-from-detail-pages.mjs` does this:

    node scripts/parse-detail-page.mjs --plan --per-listing listings.json > plan.json
    # scrape each plan url into seed/detail-pages/<id>.md, then:
    node scripts/raw-from-detail-pages.mjs plan.json seed/detail-pages > raw.json
    node scripts/transform-listings.mjs raw.json > listings.json

That makes the first transform pass a bootstrap whose only real output is the
plan's id+url+community list. It is slightly circular but cheap, and it means
the per-listing scrape we were already paying for now also *validates* the
cheap extraction instead of trusting it.

A detail page that 404s (withdrawn between the two scrapes) drops the listing;
2 of 89 did on 2026-11-04.

## A third benchmark-scoping trap: property type (2026-11-04)

Property Finder's published average is scoped by **property type** as well as
community and bedroom count, and like the sub-development trap it never says so.

Jumeirah Village Circle 2-beds had two pages that disagreed by 26%, and neither
was a parse error — an apartment page reporting 1,734,766 / 1,325 sqft
(1,309/sqft) and a villa page reporting 4,105,683 / 3,949 sqft (1,039/sqft).
`enrich` keyed the vote on `community|band` only, so it pooled them and put a
median that was half apartment under Block F, a 6,781 sqft 2-bed villa asking
634/sqft — reading it as **46% below market**. Against the villa figure it is
39%, and the band vote now keys on `community|band|family` (`family()` puts
villa/townhouse/compound in "house" and everything else in "flat", because what
moves a psf is stacked-vs-ground and PF files duplexes with apartments).

**Block F is still not a deal, and the band cannot make it one.** PF's own page
says it costs 5% *more* than the average while being 72% *bigger*; per sqft that
is 39% below. "2-bed villa in JVC" spans a 3,949 sqft average and a 6,781 sqft
listing, so the bed band is not controlling for size at all here — the very
effect bed banding exists to neutralise. Treat a large outlier inside a
house band as a size artifact until its own development has 3+ comparables.

Still open, and deliberately not changed: **Sharjah Garden City 4plus warns at
17%** because `band()` lumps 4-bed (4,206,121 / 4,969 = 846) with 5-bed
(5,169,069 / 7,171 = 721). Both are villas and both figures parse correctly, so
the median (721) just benchmarks the 4-beds low, which is the conservative
direction. Splitting "4plus" into 4 and 5 would fix it and would change scores.

## Bayut is behind a bot check; the sweep is Property Finder only (2026-11-04)

`https://www.bayut.com/for-sale/...` returned **HTTP 503 "Security check"** on a
plain Firecrawl scrape. Two things follow.

- **A `formats: ["json"]` extraction of a block page invents listings.** The 503
  interstitial produced two confident, well-formed, entirely fictional rows —
  "Sky Gardens" in a community called "Damas", `example.com` listing URLs. The
  only tell was `metadata.statusCode`. **Check `statusCode === 200` and that
  each `listingURL` is on the portal's own host before using an extraction.**
- Retrying Bayut through `proxy: "stealth"` was refused by the session's
  permission layer as bot-check circumvention, so it was not attempted again.
  Nothing was routed around.

Property Finder covered all ten tracked areas on its own, so this cost coverage
breadth rather than the sweep. PF is the preferred benchmark anyway (see above),
so the loss is the Bayut cross-check that catches a PF scoping oddity, not the
benchmark itself. If Bayut is wanted back, it needs a decision from Garvit about
how (an allowed proxy mode, or a different source) — it is not a code fix.

## Property Finder URL shapes the sweep needs (2026-11-04)

Area pages are SEO slugs, not the `?l=<locId>` ids recorded earlier:
`https://www.propertyfinder.ae/en/buy/<emirate>/properties-for-sale-<area>.html?ob=nd`.
`properties-for-sale-` (not `apartments-for-sale-`) is deliberate: Tilal City,
Al Rahmaniya, Al Tai, Sharjah Garden City and Al Menhaz are villa/townhouse
stock and an apartments-only page returns almost nothing there.

Two slugs are not guessable from the area name:

- **JVC** is `properties-for-sale-jumeirah-village-circle` — *not*
  `...-jumeirah-village-circle-jvc`, which 404s.
- **Al Menhaz has no Property Finder landing page.** PF files the Masaar 3 /
  Al Sehma stock that the listings themselves place "in Al Menhaz, Sharjah"
  under **Al Ruwaidat Suburb** (`properties-for-sale-al-rowdat-suburb`, which
  redirects to `al-ruwaidat-suburb`). The sweep scrapes that page and files the
  results under the tracked name "Al Menhaz", which is why the tracked community
  cannot be read off the page and has to come from the plan.

**Land plots are excluded.** `properties-for-sale-` returns them in Al Rahmaniya
and Al Ruwaidat Suburb; they carry no beds and no built-up area, so their psf is
not comparable with built stock and they would pollute a band.

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

## Property Finder is the better benchmark (2026-08-30)

An earlier version of this file said PF's building-vs-area comparison was "only
a plotted chart… nothing extractable beyond its transactions table". That was
wrong, and it cost the project a worse benchmark for a day. PF states, in page
text, on every sale listing:

    Transactions for Similar Properties
    2 Beds Apartment in Barcelo Residences (Al Dar Tower)

    This property costs 3% less than the average
    Average Sale Price is 2,996,887 AED
    This property is 7% bigger than the average
    Average size is 1,407 sqft

    ...average prices and sizes of all listings that were live on
    Property Finder in Dubai Marina

Dividing the two averages gives an asking-price psf. **The scope is stated, not
inferred** — which is the whole point, because Bayut's has to be guessed and is
sometimes a sub-development's (see the traps section below).

Two live checks on 2026-08-30 pinned what that figure is scoped to:

- **Banded by bedroom.** Same building, two bands: 1-bed 1,842,999 / 841 sqft
  (2,191); 2-bed 2,996,887 / 1,407 sqft (2,130). It moves with the band despite
  the disclaimer not saying so.
- **Scoped to the community, not the building.** Barcelo Residences and Marina
  View Tower B — different towers — report the *identical* 1,842,999 / 841 for
  Dubai Marina 1-beds.

So it is a community-and-band asking average: exactly the denominator the
below-market signal wants, and the same basis as our own number.

**Where the portals disagree, PF wins.** On Dubai Marina 1-beds Bayut published
2,592 and PF 2,191 — an 18% gap, and not a parse error on either side. Bayut's
own top-five table for that same band reads 2,999 / 1,338 / 1,570 / 2,237 /
1,526 (mean 1,934), so its stated area average sits above four of the five
towers it lists; PF's 2,191 sits inside that range and is corroborated across
two buildings. `enrich` therefore prefers a PF figure over a Bayut one for the
same band, regardless of scrape order, and `--plan` picks a PF listing as a
band's representative when one exists. The 2-bed band, where the two agree
within 2.5% (2,130 vs 2,079), is the control that says this is a scoping
disagreement and not a systematic portal difference.

What switching to PF did to the seed batch (14 listings re-benchmarked, all
Dubai Marina): three below-market signals that should never have fired went to
zero — Bay Central West and Barcelo's 1-bed both moved from "11% below" to 5%
*above* market, Silverene Tower B from 7% below to 11% above — and Sanibel
Tower and Fairfield Tower fell from 22%/20% below to 8%/6%. The genuine top
signal survived (Marina View Tower B, 54% → 46%). Net: fewer false positives,
same real deals.

**One caveat, proven on live pages.** PF's transactions table is scoped to the
building but its bedroom caption is *not* enforced: the 1-bed page of Barcelo
Residences listed that tower's 1,095 sqft 2-bed sales under a "1 Bed Apartment
in…" heading. The parser re-bands those rows by size (±35% of the listing's
sqft) rather than trusting the caption.

**Also worth knowing:** PF's own "% less than the average" is size-blind — it
compares total price. A 718 sqft 1-bed at 1,650,000 is advertised as "10% less
than the average" while also being "15% smaller"; per sqft it is 2,298 against
a 2,191 average, i.e. 5% *above* market. That size-blind comparison is exactly
what the bed banding exists to avoid. Never surface PF's percentage as-is.

**Still unbuilt:** per-listing enrichment. Everything genuinely per-listing —
a tower's own average, its own transactions — is only available for the ~1 page
per band we actually fetch (10 pages covered 39 listings; only 2 of 75 rows in
D1 carry their own building's sales). Getting it for every listing means one
page per listing: ~75 credits a day instead of ~10. Not done; decide before
building.

## Per-listing enrichment (2026-08-30)

`--plan --per-listing` scrapes every listing's own detail page. What it buys:

- **`buildingTxnPsf`** — the median AED/sqft of *recorded sales* in that
  listing's own building, size-banded, with `buildingTxnCount` alongside.
  This is the exact-tower comparison the band plan can never reach: with one
  page per band, only the ~1 listing per band whose page was actually fetched
  has its own building's data. 17 of 54 on the mixed run here; near-complete
  under a full per-listing sweep.
- **A vote on the area average.** With one page per band there is nothing to
  compare, so a figure scoped to a sub-development is caught only when it
  coincides with a row in the per-location table. With many pages per band the
  median settles it, and `enrich` reports any band whose pages disagree by more
  than 15%. Property Finder still wins outright where present.

**Three gates before a figure is published**, because the card says "what
buyers paid" and a person will act on it: at least three sales, a spread under
2x among them, and a median within 0.4–2.5x of the area average. Bugatti
Residences forced the third one. Its table parsed correctly and its same-size
sales were only 1.6x apart, so the first two gates passed — but the ±35% size
filter had kept only the small units, which in a branded tower are the premium
ones. The median came out at 12,217 against a 2,684 area average and a 5,464
asking price: a 55% "bargain" that is really a tower not comparable to its
neighbourhood. Rejected figures are also actively *cleared*, not merely
not-set, or a listing carrying one from a looser earlier run would keep
publishing it. The published median always travels with its low and high so the
card can show a range rather than false precision.

**`buildingTxnPsf` is deliberately not scored.** These are settled prices and
`askingPrice` is an asking price; folding them into `buildingPsf` would compare
what a seller wants against what buyers paid and read the ordinary gap between
them as a great deal. It is displayed as its own card ("What buyers paid") and the
detail screen says plainly that the scored averages are asking prices. Adding
a signal for "priced below even the settled comps" is a real idea, but it is a
scoring change and has not been made — scores are byte-identical before and
after this work.

Worth knowing when reading the numbers: asking sits above settled far more
often than not (Barcelo Residences asks 1,916 against 1,744 settled; The Jewel
Tower B asks 1,649 against 1,046 over five sales). That is normal, not a red
flag, which is exactly why the two bases must not share a field.

## The scrape recipe strips the headings the parser used to need

Found 2026-08-30 while validating per-listing enrichment, and it would have
broken the live sweep silently.

`includeTags: ["table","svg"]` — the documented Bayut recipe — removes **every
heading** from the page. The parser anchored on `### Popular locations`,
`### Average price/sqft` and `## Similar Property Transactions`, so against a
real scrape it returned no area average, no building table and no transactions
at all. It passed its tests only because the fixtures in `seed/detail-pages/`
are hand-trimmed transcripts that kept their headings.

Tables are now located by their own header row (`| Date | Area (sqft) | Price |`,
`| | Avg. price/sqft | VS ... |`) and the area figure is read from the chart's
SVG text anywhere on the page; the heading path is still preferred when
headings exist. `tests/fixtures/bayut-detail-raw.md` is a verbatim scrape with
no headings, so this cannot regress.

The lesson generalises: **fixtures must be what the scraper actually returns.**
A hand-tidied transcript tests the parser against a page that never exists.

## Gotchas already hit

- **The app's own domain needs an egress allowlist entry.** *(Resolved
  2026-08-30 — kept because it will recur if the environment is recreated.)*
  `distress-radar.pages.dev` returned 403 on CONNECT under the Default
  environment's **Trusted** network level, so a session could not call
  `/api/ingest` or `/api/digest` — the two HTTP hops in the sweep. The fix is
  claude.ai/code → environment selector (the cloud icon above the message box)
  → gear on **Default** → Network access **Custom** → add
  `distress-radar.pages.dev`, and **tick "Also include default list of common
  package managers"**, or npm and the registries stop resolving too. Firecrawl
  is unaffected either way: MCP connector traffic does not go through the
  session allowlist. Writing to D1 through the Cloudflare connector also works
  and is how the first loads were done while this was blocked.
- **`/api/digest` needs authentication.** Unauthenticated it returns
  `{"ok":false,"error":{"code":"unauthorized"}}`, which is easy to mistake for
  "no deals". Call it with `Authorization: Bearer $INGEST_TOKEN`.
- **`recipient` comes back as an empty string, not null,** when no digest
  address has been set in app Settings. Any fallback that only tests for `null`
  will send the digest nowhere on the first day there is one. Either set the
  address in Settings or treat empty as unset.

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
