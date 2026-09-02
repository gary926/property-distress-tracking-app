import type { Env } from "./env";
import { fail, ok, readJson } from "./http";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_ATTEMPTS = 8;
export const SESSION_COOKIE = "dr_session";

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

export async function sessionIsValid(request: Request, env: Env): Promise<boolean> {
  if (!env.SESSION_SECRET) return false;
  const cookie = getCookie(request, SESSION_COOKIE);
  if (!cookie) return false;
  const [id, sig] = cookie.split(".");
  if (!id || !sig) return false;
  const expected = await hmac(id, env.SESSION_SECRET);
  if (!timingSafeEqual(sig, expected)) return false;
  const row = await env.DB.prepare("SELECT expires_at FROM sessions WHERE id = ?")
    .bind(id)
    .first<{ expires_at: number }>();
  return !!row && row.expires_at > Date.now();
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (!env.APP_PASSWORD || !env.SESSION_SECRET) {
    // Pages secrets are production-scoped and bind at deploy time, so this
    // fires on a preview (non-production-branch) deployment, or when secrets
    // were set without redeploying afterwards.
    return fail(
      500,
      "not_configured",
      "APP_PASSWORD / SESSION_SECRET are not bound to this deployment. If the URL has a hash prefix it is a preview deployment, which does not receive production secrets — redeploy to the production branch (npm run cf:deploy). Check /api/health to see which secrets this deployment can see.",
    );
  }
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const windowStart = Date.now() - RATE_WINDOW_MS;
  await env.DB.prepare("DELETE FROM login_attempts WHERE ts < ?").bind(windowStart).run();
  const attempts = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND ts >= ?",
  )
    .bind(ip, windowStart)
    .first<{ n: number }>();
  if ((attempts?.n ?? 0) >= RATE_MAX_ATTEMPTS) {
    return fail(429, "rate_limited", "Too many attempts. Try again in 15 minutes.");
  }

  const body = await readJson<{ password?: string }>(request);
  const supplied = body?.password ?? "";
  if (!supplied || !timingSafeEqual(supplied, env.APP_PASSWORD)) {
    await env.DB.prepare("INSERT INTO login_attempts (ip, ts) VALUES (?, ?)")
      .bind(ip, Date.now())
      .run();
    return fail(401, "bad_password", "Wrong password.");
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO sessions (id, created_at, expires_at) VALUES (?, ?, ?)",
  )
    .bind(id, now, now + SESSION_TTL_MS)
    .run();
  const sig = await hmac(id, env.SESSION_SECRET);
  return ok(
    { authenticated: true },
    {
      headers: {
        "set-cookie": `${SESSION_COOKIE}=${id}.${sig}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
      },
    },
  );
}

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const cookie = getCookie(request, SESSION_COOKIE);
  const id = cookie?.split(".")[0];
  if (id) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
  return ok(
    { authenticated: false },
    { headers: { "set-cookie": `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0` } },
  );
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

export function ingestAuthorized(request: Request, env: Env): boolean {
  const token = bearerToken(request);
  return !!env.INGEST_TOKEN && !!token && timingSafeEqual(token, env.INGEST_TOKEN);
}
