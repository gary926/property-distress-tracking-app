// Build the frontend (Vite) and bundle the Pages worker (esbuild) into dist/.
import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await rm(path.join(root, "dist"), { recursive: true, force: true });

await viteBuild({ root });

await esbuild({
  entryPoints: [path.join(root, "src/worker/index.ts")],
  bundle: true,
  format: "esm",
  outfile: path.join(root, "dist/_worker.js"),
  platform: "neutral",
  conditions: ["workerd", "worker"],
  minify: true,
  logLevel: "info",
});

console.log("Build complete → dist/ (static assets + _worker.js)");
