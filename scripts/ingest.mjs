// Push a JSON file of listings into a deployment's ingest endpoint.
//   APP_URL=https://<project>.pages.dev INGEST_TOKEN=... node scripts/ingest.mjs listings.json
import { readFileSync } from "node:fs";

const [file] = process.argv.slice(2);
const { APP_URL, INGEST_TOKEN } = process.env;
if (!file || !APP_URL || !INGEST_TOKEN) {
  console.error("Usage: APP_URL=... INGEST_TOKEN=... node scripts/ingest.mjs <listings.json>");
  process.exit(1);
}

const listings = JSON.parse(readFileSync(file, "utf8"));
const res = await fetch(`${APP_URL.replace(/\/$/, "")}/api/ingest`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${INGEST_TOKEN}` },
  body: JSON.stringify({ listings: Array.isArray(listings) ? listings : listings.listings }),
});
const body = await res.json();
if (!res.ok || !body.ok) {
  console.error("Ingest failed:", JSON.stringify(body.error ?? body));
  process.exit(1);
}
console.log("Ingested:", JSON.stringify(body.data));
