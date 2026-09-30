// Push a JSON file of listings into a deployment's ingest endpoint.
//   APP_URL=https://<project>.pages.dev INGEST_TOKEN=... node scripts/ingest.mjs listings.json
import { readFileSync } from "node:fs";

const [file] = process.argv.slice(2);
const { APP_URL, INGEST_TOKEN } = process.env;
if (!file || !APP_URL || !INGEST_TOKEN) {
  console.error("Usage: APP_URL=... INGEST_TOKEN=... node scripts/ingest.mjs <listings.json>");
  process.exit(1);
}

/** Benchmarks the sweep recomputes every run. Sent explicitly as null when this
 *  batch has no figure, because "absent" and "withdrawn" must not look the same
 *  to an update: `/api/ingest` merges an update over the stored row, so a field
 *  simply left out keeps its old value. On 2026-09-30 that kept a withdrawn
 *  buildingPsf alive and held a listing in the digest at "30% below its
 *  building" after the pipeline had stopped publishing that number. The worker
 *  now clears these fields too, but sending the null makes the batch
 *  self-describing and correct against a worker that has not been redeployed. */
const DERIVED_BENCHMARK_FIELDS = [
  "buildingPsf",
  "buildingPsfLabel",
  "areaPsf",
  "benchmarkSource",
  "buildingTxnPsf",
  "buildingTxnCount",
  "buildingTxnLow",
  "buildingTxnHigh",
];

const parsed = JSON.parse(readFileSync(file, "utf8"));
const listings = (Array.isArray(parsed) ? parsed : parsed.listings).map((l) => {
  const out = { ...l };
  for (const f of DERIVED_BENCHMARK_FIELDS) if (out[f] === undefined) out[f] = null;
  return out;
});

const res = await fetch(`${APP_URL.replace(/\/$/, "")}/api/ingest`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${INGEST_TOKEN}` },
  body: JSON.stringify({ listings }),
});
const body = await res.json();
if (!res.ok || !body.ok) {
  console.error("Ingest failed:", JSON.stringify(body.error ?? body));
  process.exit(1);
}
console.log("Ingested:", JSON.stringify(body.data));
