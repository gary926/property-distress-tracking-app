// Minimal Cloudflare bindings used by this worker — kept local so the project
// needs no extra type packages.
export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: { changes?: number; last_row_id?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface Env {
  DB: D1Database;
  APP_PASSWORD?: string;
  SESSION_SECRET?: string;
  INGEST_TOKEN?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}
