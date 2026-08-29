-- Distress Radar — D1 schema. Apply with `npm run cf:schema` (remote)
-- or `npm run cf:schema:local` (wrangler pages dev local D1).

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_ts ON login_attempts (ip, ts);

-- Per-deal workflow state (pipeline status, watchlist, notes, snooze, never-flag).
CREATE TABLE IF NOT EXISTS deal_state (
  deal_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'new',
  watchlisted INTEGER NOT NULL DEFAULT 0,
  snoozed_until TEXT,
  never_flag INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  updated_at INTEGER NOT NULL
);

-- Single-user JSON settings documents: 'alerts', 'scoring', 'saved_searches'.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Listings captured by the ingest endpoint. `data` is the full listing JSON;
-- price changes append rows to price_points, which is how drop/relist
-- detection accrues over daily scrape runs.
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  asking_price INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS price_points (
  listing_id TEXT NOT NULL,
  date TEXT NOT NULL,
  price INTEGER NOT NULL,
  PRIMARY KEY (listing_id, date)
);
