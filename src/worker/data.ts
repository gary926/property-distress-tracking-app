import type { Env } from "./env";
import { fail, ok, readJson } from "./http";
import type {
  AlertSettings,
  Listing,
  PricePoint,
  SavedSearch,
  ScoringSettings,
} from "../shared/types";
import { listings as demoListings } from "../shared/mockData";
import { defaultScoring, scoreListing } from "../shared/scoring";

interface ListingRow {
  id: string;
  data: string;
  first_seen: string;
  last_seen: string;
  asking_price: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Listings come from D1 (fed by the ingest endpoint); the bundled demo
 *  snapshot is served until the first real ingest lands. */
export async function getListings(env: Env): Promise<{ listings: Listing[]; source: "live" | "demo" }> {
  const rows = await env.DB.prepare("SELECT * FROM listings").all<ListingRow>();
  if (rows.results.length === 0) return { listings: demoListings, source: "demo" };

  const points = await env.DB.prepare(
    "SELECT listing_id, date, price FROM price_points ORDER BY date ASC",
  ).all<{ listing_id: string; date: string; price: number }>();
  const byListing = new Map<string, PricePoint[]>();
  for (const p of points.results) {
    const arr = byListing.get(p.listing_id) ?? [];
    arr.push({ date: p.date, price: p.price });
    byListing.set(p.listing_id, arr);
  }

  const listings = rows.results.map((row) => {
    const data = JSON.parse(row.data) as Listing;
    return {
      ...data,
      id: row.id,
      askingPrice: row.asking_price,
      priceHistory: byListing.get(row.id) ?? [{ date: row.first_seen, price: row.asking_price }],
      firstSeen: row.first_seen,
    };
  });
  return { listings, source: "live" };
}

export async function handleListings(env: Env): Promise<Response> {
  const { listings, source } = await getListings(env);
  return ok({ source, listings });
}

/** Upsert scraped listings; price changes append to price_points, which is how
 *  drop/relist detection accrues over daily ingest runs. */
export async function handleIngest(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ listings?: (Partial<Listing> & { id: string; askingPrice: number })[] }>(request);
  if (!body?.listings?.length) {
    return fail(400, "bad_request", "Body must be { listings: [...] } with at least one listing.");
  }

  let created = 0;
  let priceCuts = 0;
  let updated = 0;
  let rejectedRentals = 0;
  const date = today();

  for (const incoming of body.listings) {
    if (!incoming.id || typeof incoming.askingPrice !== "number") continue;
    // v1 is sale-only. The transform already filters rentals, but a rental that
    // slipped through would sit ~2 orders of magnitude below the sale prices in
    // its group and poison every psf benchmark there — so reject at the door.
    if (incoming.listingType && incoming.listingType !== "sale") {
      rejectedRentals++;
      continue;
    }
    const existing = await env.DB.prepare("SELECT * FROM listings WHERE id = ?")
      .bind(incoming.id)
      .first<ListingRow>();

    if (!existing) {
      const data: Listing = {
        ...(incoming as Listing),
        priceHistory: [{ date, price: incoming.askingPrice }],
        firstSeen: date,
      };
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO listings (id, data, first_seen, last_seen, asking_price) VALUES (?, ?, ?, ?, ?)",
        ).bind(incoming.id, JSON.stringify(data), date, date, incoming.askingPrice),
        env.DB.prepare(
          "INSERT INTO price_points (listing_id, date, price) VALUES (?, ?, ?)",
        ).bind(incoming.id, date, incoming.askingPrice),
      ]);
      created++;
      continue;
    }

    const merged = { ...(JSON.parse(existing.data) as Listing), ...incoming };
    const statements = [
      env.DB.prepare(
        "UPDATE listings SET data = ?, last_seen = ?, asking_price = ? WHERE id = ?",
      ).bind(JSON.stringify(merged), date, incoming.askingPrice, incoming.id),
    ];
    if (incoming.askingPrice !== existing.asking_price) {
      statements.push(
        env.DB.prepare(
          "INSERT INTO price_points (listing_id, date, price) VALUES (?, ?, ?) ON CONFLICT(listing_id, date) DO UPDATE SET price = excluded.price",
        ).bind(incoming.id, date, incoming.askingPrice),
      );
      if (incoming.askingPrice < existing.asking_price) priceCuts++;
    }
    await env.DB.batch(statements);
    updated++;
  }

  return ok({ created, updated, priceCuts, rejectedRentals });
}

// ---- Settings documents (single-user JSON docs in the settings table) ----

export async function getSettingsDoc<T>(env: Env, key: string): Promise<T | null> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function putSettingsDoc(env: Env, key: string, value: unknown): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  )
    .bind(key, JSON.stringify(value), Date.now())
    .run();
}

export interface DealStateRow {
  deal_id: string;
  status: string;
  watchlisted: number;
  snoozed_until: string | null;
  never_flag: number;
  note: string | null;
}

export async function handleGetState(env: Env): Promise<Response> {
  const [rows, alerts, scoring, savedSearches] = await Promise.all([
    env.DB.prepare("SELECT * FROM deal_state").all<DealStateRow>(),
    getSettingsDoc<AlertSettings>(env, "alerts"),
    getSettingsDoc<ScoringSettings>(env, "scoring"),
    getSettingsDoc<SavedSearch[]>(env, "saved_searches"),
  ]);
  const dealState: Record<string, unknown> = {};
  for (const r of rows.results) {
    dealState[r.deal_id] = {
      status: r.status,
      watchlisted: !!r.watchlisted,
      snoozedUntil: r.snoozed_until ?? undefined,
      neverFlag: !!r.never_flag,
      note: r.note ?? undefined,
    };
  }
  return ok({ dealState, alerts, scoring, savedSearches });
}

export async function handlePutDealState(request: Request, env: Env, dealId: string): Promise<Response> {
  const body = await readJson<{
    status?: string;
    watchlisted?: boolean;
    snoozedUntil?: string | null;
    neverFlag?: boolean;
    note?: string | null;
  }>(request);
  if (!body) return fail(400, "bad_request", "Invalid JSON body.");
  await env.DB.prepare(
    `INSERT INTO deal_state (deal_id, status, watchlisted, snoozed_until, never_flag, note, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(deal_id) DO UPDATE SET
       status = excluded.status,
       watchlisted = excluded.watchlisted,
       snoozed_until = excluded.snoozed_until,
       never_flag = excluded.never_flag,
       note = excluded.note,
       updated_at = excluded.updated_at`,
  )
    .bind(
      dealId,
      body.status ?? "new",
      body.watchlisted ? 1 : 0,
      body.snoozedUntil ?? null,
      body.neverFlag ? 1 : 0,
      body.note ?? null,
      Date.now(),
    )
    .run();
  return ok({ saved: true });
}

// ---- Daily digest ----

/** Deals captured or cut in the last 24h, scored with the stored settings.
 *  Consumed in-app (preview) and by the scheduled sender (email + push). */
export async function buildDigest(env: Env) {
  const [{ listings, source }, alerts, scoring] = await Promise.all([
    getListings(env),
    getSettingsDoc<AlertSettings>(env, "alerts"),
    getSettingsDoc<ScoringSettings>(env, "scoring"),
  ]);
  const minScore = alerts?.email.minScore ?? 50;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  const scored = listings.map((l) => scoreListing(l, scoring ?? defaultScoring));
  const fresh = scored
    .filter((d) => {
      const isNew = new Date(d.firstSeen + "T00:00:00Z").getTime() >= cutoff - 12 * 60 * 60 * 1000;
      const lastPoint = d.priceHistory[d.priceHistory.length - 1];
      const freshCut =
        d.priceHistory.length > 1 &&
        new Date(lastPoint.date + "T00:00:00Z").getTime() >= cutoff - 12 * 60 * 60 * 1000 &&
        lastPoint.price < d.priceHistory[d.priceHistory.length - 2].price;
      return (isNew || freshCut) && d.score >= minScore;
    })
    .sort((a, b) => b.score - a.score);

  return {
    generatedAt: new Date().toISOString(),
    source,
    recipient: alerts?.email.address ?? null,
    subject: `Great Radar — ${fresh.length} new deal${fresh.length === 1 ? "" : "s"} in the last 24h`,
    deals: fresh.map((d) => ({
      id: d.id,
      title: `${d.building} · ${d.title}`,
      location: `${d.community}, ${d.emirate}`,
      price: d.askingPrice,
      score: d.score,
      tier: d.tier,
      dropPct: Math.round(d.dropPct),
      belowMarketPct: Math.round(d.belowMarketPct),
      topSignal: d.signals[0]?.label ?? null,
    })),
  };
}

export async function handleDigest(env: Env): Promise<Response> {
  return ok(await buildDigest(env));
}
