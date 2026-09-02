// Wrangler wrappers: node scripts/cloudflare.mjs <setup|deploy|secrets|status|schema|schema:local|seed>
// Requires `npx wrangler login` (or CLOUDFLARE_API_TOKEN) once beforehand.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cmd = process.argv[2];
const DB_NAME = "distress-radar-db";
const PROJECT = "distress-radar";
// Pages serves the production branch at <project>.pages.dev; any other branch
// becomes a *preview* deployment on a hashed subdomain. Pages secrets set via
// `pages secret put` are production-scoped, so a preview deployment starts with
// no APP_PASSWORD and the app reports "app password not set". This is a
// single-user app with no use for preview deploys, so always deploy to the
// production branch regardless of the git branch checked out.
// Override with PRODUCTION_BRANCH=<name> if the Pages project was created with
// a different production branch (check: npm run cf:status).
const PRODUCTION_BRANCH = process.env.PRODUCTION_BRANCH || "main";

function run(args, opts = {}) {
  const res = spawnSync("npx", ["wrangler", ...args], {
    cwd: root,
    stdio: opts.capture ? ["inherit", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (res.status !== 0 && !opts.allowFail) process.exit(res.status ?? 1);
  return res.stdout ?? "";
}

function setDatabaseId(id) {
  const tomlPath = path.join(root, "wrangler.toml");
  const toml = readFileSync(tomlPath, "utf8");
  writeFileSync(tomlPath, toml.replace(/database_id = ".*"/, `database_id = "${id}"`));
  console.log(`wrangler.toml updated with database_id ${id}`);
}

switch (cmd) {
  case "setup": {
    // Create (or find) the D1 database, wire its id into wrangler.toml, apply schema.
    const out = run(["d1", "create", DB_NAME], { capture: true, allowFail: true });
    let id = out.match(/database_id = "([0-9a-f-]+)"/)?.[1];
    if (!id) {
      const list = run(["d1", "list", "--json"], { capture: true });
      try {
        id = JSON.parse(list).find((d) => d.name === DB_NAME)?.uuid;
      } catch {
        /* fall through */
      }
    }
    if (!id) {
      console.error("Could not determine the D1 database id. Run `npx wrangler d1 list` and paste the id into wrangler.toml.");
      process.exit(1);
    }
    setDatabaseId(id);
    run(["d1", "execute", DB_NAME, "--remote", "--file", "db/schema.sql"]);
    run(["pages", "project", "create", PROJECT, "--production-branch", "main"], { allowFail: true });
    console.log("Setup complete. Next: npm run cf:secrets && npm run cf:deploy");
    break;
  }
  case "deploy": {
    const build = spawnSync("node", ["scripts/build.mjs"], { cwd: root, stdio: "inherit" });
    if (build.status !== 0) process.exit(build.status ?? 1);
    run([
      "pages",
      "deploy",
      "dist",
      "--project-name",
      PROJECT,
      "--branch",
      PRODUCTION_BRANCH,
    ]);
    console.log(
      `\nDeployed to the ${PRODUCTION_BRANCH} (production) branch → https://${PROJECT}.pages.dev` +
        "\nVerify secrets reached it:  curl -s https://" + PROJECT + ".pages.dev/api/health",
    );
    break;
  }
  case "secrets": {
    // Wrangler prompts for each value so no script ever sees it. Pages binds
    // secrets at deploy time — a redeploy afterwards is mandatory.
    for (const name of ["APP_PASSWORD", "SESSION_SECRET", "INGEST_TOKEN"]) {
      console.log(`\nSetting ${name} (input hidden):`);
      run(["pages", "secret", "put", name, "--project-name", PROJECT]);
    }
    console.log(
      "\nSecrets stored (production scope). Now run: npm run cf:deploy" +
        "\nPages binds secrets at deploy time, so a redeploy is mandatory.",
    );
    break;
  }
  case "status": {
    // The Branch column shows which deployments are production vs preview.
    run(["pages", "project", "list"], { allowFail: true });
    run(["pages", "deployment", "list", "--project-name", PROJECT]);
    run(["d1", "info", DB_NAME], { allowFail: true });
    break;
  }
  case "schema": {
    run(["d1", "execute", DB_NAME, "--remote", "--file", "db/schema.sql"]);
    break;
  }
  case "schema:local": {
    run(["d1", "execute", DB_NAME, "--local", "--file", "db/schema.sql"]);
    break;
  }
  default:
    console.log("Usage: node scripts/cloudflare.mjs <setup|deploy|secrets|status|schema|schema:local>");
    process.exit(1);
}
