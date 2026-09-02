// Fixtures preview server — serves the built frontend from dist/ with a
// stubbed, signed-in /api so pages can be inspected without a password or a
// Cloudflare session. State mutations persist in memory for the process.
//
//   node scripts/build.mjs && node scripts/preview-fixtures.mjs [port]
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { pathToFileURL } from "node:url";
import os from "node:os";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const port = Number(process.argv[2] ?? 4173);

// Bundle the shared data layer so plain Node can import it.
const tmp = path.join(os.tmpdir(), `dr-fixtures-${Date.now()}.mjs`);
await esbuild({
  entryPoints: [path.join(root, "src/shared/fixtures-entry.ts")],
  bundle: true,
  format: "esm",
  outfile: tmp,
  platform: "neutral",
  logLevel: "silent",
});
const { listings, buildFixtureDigest } = await import(pathToFileURL(tmp).href);

const state = {
  dealState: {},
  alerts: null,
  scoring: null,
  savedSearches: null,
};

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
};

function json(res, data, status = 200) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, data }));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const p = url.pathname;

  if (p.startsWith("/api/")) {
    if (p === "/api/session") return json(res, { authenticated: true });
    if (p === "/api/health")
      return json(res, {
        db: true,
        listingCount: listings.length,
        secrets: { APP_PASSWORD: true, SESSION_SECRET: true, INGEST_TOKEN: true },
        fixtures: true,
      });
    if (p === "/api/listings") return json(res, { source: "demo", listings });
    if (p === "/api/state" && req.method === "GET") return json(res, state);
    if (p === "/api/digest") return json(res, buildFixtureDigest(state.alerts, state.scoring));
    const deal = p.match(/^\/api\/state\/deal\/([\w-]+)$/);
    if (deal && req.method === "PUT") {
      state.dealState[deal[1]] = { ...state.dealState[deal[1]], ...(await readBody(req)) };
      return json(res, { saved: true });
    }
    const doc = p.match(/^\/api\/state\/(alerts|scoring|saved_searches)$/);
    if (doc && req.method === "PUT") {
      const key = doc[1] === "saved_searches" ? "savedSearches" : doc[1];
      state[key] = await readBody(req);
      return json(res, { saved: true });
    }
    if (p === "/api/login" && req.method === "POST") return json(res, { authenticated: true });
    if (p === "/api/logout" && req.method === "POST") return json(res, { authenticated: false });
    res.writeHead(404, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: false, error: { code: "not_found", message: p } }));
  }

  // Static files with SPA fallback.
  let filePath = path.join(dist, p === "/" ? "index.html" : p.slice(1));
  try {
    let body = await readFile(filePath);
    res.writeHead(200, { "content-type": mime[path.extname(filePath)] ?? "application/octet-stream" });
    return res.end(body);
  } catch {
    const body = await readFile(path.join(dist, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(body);
  }
});

server.listen(port, () => {
  console.log(`Fixtures preview (signed-in, demo data): http://localhost:${port}`);
});
