import type { Env } from "./env";
import { fail, ok } from "./http";
import {
  handleLogin,
  handleLogout,
  ingestAuthorized,
  sessionIsValid,
} from "./auth";
import {
  handleDigest,
  handleGetState,
  handleIngest,
  handleListings,
  handlePutDealState,
  putSettingsDoc,
} from "./data";
import { readJson } from "./http";

async function handleHealth(env: Env): Promise<Response> {
  let db = false;
  let listingCount = 0;
  try {
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM listings").first<{ n: number }>();
    listingCount = row?.n ?? 0;
    db = true;
  } catch {
    db = false;
  }
  // "configured" means present, not valid — see the skill's gotcha list.
  return ok({
    db,
    listingCount,
    secrets: {
      APP_PASSWORD: !!env.APP_PASSWORD,
      SESSION_SECRET: !!env.SESSION_SECRET,
      INGEST_TOKEN: !!env.INGEST_TOKEN,
    },
  });
}

async function handleApi(request: Request, env: Env, path: string): Promise<Response> {
  const method = request.method.toUpperCase();

  // Public routes
  if (path === "/api/health" && method === "GET") return handleHealth(env);
  if (path === "/api/login" && method === "POST") return handleLogin(request, env);
  if (path === "/api/logout" && method === "POST") return handleLogout(request, env);
  if (path === "/api/session" && method === "GET") {
    return ok({ authenticated: await sessionIsValid(request, env) });
  }

  // Machine routes (scheduled scraper / digest sender) — Bearer INGEST_TOKEN
  if (path === "/api/ingest" && method === "POST") {
    if (!ingestAuthorized(request, env)) return fail(401, "unauthorized", "Ingest token required.");
    return handleIngest(request, env);
  }
  if (path === "/api/digest" && method === "GET") {
    if (!ingestAuthorized(request, env) && !(await sessionIsValid(request, env))) {
      return fail(401, "unauthorized", "Sign in or supply the ingest token.");
    }
    return handleDigest(env);
  }

  // Everything below requires a signed-in session.
  if (!(await sessionIsValid(request, env))) {
    return fail(401, "unauthorized", "Not signed in.");
  }

  if (path === "/api/listings" && method === "GET") return handleListings(env);
  if (path === "/api/state" && method === "GET") return handleGetState(env);

  const dealMatch = path.match(/^\/api\/state\/deal\/([\w-]+)$/);
  if (dealMatch && method === "PUT") return handlePutDealState(request, env, dealMatch[1]);

  const settingsMatch = path.match(/^\/api\/state\/(alerts|scoring|saved_searches)$/);
  if (settingsMatch && method === "PUT") {
    const body = await readJson<unknown>(request);
    if (body === null) return fail(400, "bad_request", "Invalid JSON body.");
    await putSettingsDoc(env, settingsMatch[1], body);
    return ok({ saved: true });
  }

  return fail(404, "not_found", `No route for ${method} ${path}`);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url.pathname);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unexpected error";
        return fail(500, "internal", message);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
