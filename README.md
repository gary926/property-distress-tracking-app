# Distress Radar

A personal dashboard that tracks **distressed property deals across the UAE** —
price drops, below-market pricing, urgency language, and stale/relisted
patterns — scored 0–100 and delivered through in-app review, push
notifications, and a daily digest email.

Design: Apple-style minimal light theme with the Gemini blue→indigo→violet
gradient (see `DESIGN_BRIEF.md`). Features: `FEATURES.md`. Architecture
decisions and operating runbook: `HANDOFF.md`.

## Stack

Cloudflare **Pages** (static assets + one bundled `_worker.js`), **D1** for all
state, React + TypeScript + Vite frontend with a hand-rolled router, hand-rolled
SVG charts, one CSS file, and a PWA manifest. Runtime dependencies are exactly
`react` and `react-dom`. Auth is a single app password with HMAC-signed session
cookies stored in D1, rate-limited.

## Commands

| Command | What it does |
| --- | --- |
| `npm run build` | Vite frontend + esbuild worker → `dist/` |
| `npm test` | Vitest: scoring unit tests + architecture scans |
| `npm run preview` | Fixtures server on :4173 — signed-in app on demo data, no password |
| `npm run dev:worker` | `wrangler pages dev dist` on :8788 (real worker, local D1, `.dev.vars` secrets) |
| `npm run dev` | Vite dev server, proxies `/api` to :8788 |
| `npm run cf:setup` | Create D1 + Pages project, apply schema (needs `npx wrangler login`) |
| `npm run cf:secrets` | Set `APP_PASSWORD`, `SESSION_SECRET`, `INGEST_TOKEN` (then redeploy!) |
| `npm run cf:deploy` | Build and deploy to Cloudflare Pages |
| `npm run cf:status` | Deployments + D1 info |
| `npm run cf:schema` | Re-apply `db/schema.sql` remotely |

First deploy: `npx wrangler login`, then `cf:setup` → `cf:secrets` → `cf:deploy`.
Read the live URL from the deploy output — Cloudflare appends its own suffix.

## Data flow

- `GET /api/listings` serves from D1; until the first ingest it falls back to
  the bundled demo snapshot (`src/shared/mockData.ts`).
- `POST /api/ingest` (Bearer `INGEST_TOKEN`) upserts scraped listings. A changed
  price appends to `price_points` — **price-drop and relist detection accrue
  from these daily runs**.
- `GET /api/digest` returns the past-24h digest (new captures + fresh cuts at or
  above the email min-score), for the in-app preview and the scheduled sender.
- The daily sweep is a scheduled Claude routine: scrape portals via Firecrawl →
  `node scripts/ingest.mjs` → read `/api/digest` → send Gmail + push. See
  `HANDOFF.md` for the exact setup.
