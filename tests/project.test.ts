// Architecture scans — cheap tests that catch real regressions (see the
// build-webapp skill): forbidden externals, secrets in code, envelope drift.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (["node_modules", "dist", ".git", ".next"].includes(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

const sourceFiles = walk(path.join(root, "src"), [".ts", ".tsx", ".css"]);
const read = (f: string) => readFileSync(f, "utf8");

describe("architecture", () => {
  it("frontend has only react and react-dom as runtime dependencies", () => {
    const pkg = JSON.parse(read(path.join(root, "package.json")));
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["react", "react-dom"]);
  });

  it("no external network calls from app code (self-contained frontend)", () => {
    const offenders = sourceFiles.filter((f) => {
      const src = read(f);
      // Local API calls and font files are fine; third-party hosts are not.
      return /https:\/\/(?!fonts\.gstatic|fonts\.googleapis)[a-z0-9.-]+\.(com|io|net|dev|ai)\//i.test(src);
    });
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it("no hardcoded secrets or tokens in source", () => {
    const offenders = sourceFiles.filter((f) =>
      /(sk-ant-|api[_-]?key\s*[:=]\s*["'][A-Za-z0-9]|Bearer\s+[A-Za-z0-9_-]{20,})/i.test(read(f)),
    );
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it("worker responses always use the JSON envelope helpers", () => {
    const workerFiles = sourceFiles.filter((f) => f.includes(`${path.sep}worker${path.sep}`));
    const offenders = workerFiles.filter((f) => {
      if (f.endsWith("http.ts")) return false;
      const src = read(f);
      return /new Response\(/.test(src);
    });
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it("model names never appear in the bundle source (no AI calls in v1)", () => {
    const offenders = sourceFiles.filter((f) => /claude-[a-z0-9-]+|anthropic/i.test(read(f)));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it("secrets are read from env only in the worker, never in the frontend", () => {
    const appFiles = sourceFiles.filter((f) => f.includes(`${path.sep}app${path.sep}`));
    const offenders = appFiles.filter((f) => /APP_PASSWORD|SESSION_SECRET|INGEST_TOKEN/.test(read(f)));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it("grid minmax uses the min() guard so 360px phones don't overflow", () => {
    const css = read(path.join(root, "src/app/app.css"));
    const bare = css.match(/minmax\((?!min\()[^)]*px/g) ?? [];
    expect(bare).toEqual([]);
  });
});
