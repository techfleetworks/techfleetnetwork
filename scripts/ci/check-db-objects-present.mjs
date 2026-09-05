#!/usr/bin/env node
/**
 * DB-OBJECTS-PRESENT-001 (ADR-0034) — every table/function a committed migration
 * DECLARES must actually EXIST in prod. Verifies reality, not a ledger.
 *
 * WHY THIS EXISTS
 * ---------------
 * TechFleet migrated off Lovable onto native Supabase, but the cutover never
 * bootstrapped `supabase_migrations.schema_migrations` — so that ledger does not
 * exist in prod. The ADR-0020 gate (check-migrations-applied) queried exactly that
 * ledger, got a "relation does not exist" error, treated it as "can't reach prod"
 * and passed GREEN. It was structurally blind — the precise "a guard that verifies
 * nothing" failure the gate-integrity effort exists to kill. That is how
 * `feature_flags` (migration 20260827120000) was committed yet never applied, and
 * nobody knew until the ramp hit a missing table. This gate supersedes it (ADR-0034).
 *
 * A ledger can be missing, stale, or hand-forged. The OBJECTS cannot: either
 * `public.feature_flags` exists in prod or it does not. So this gate derives the
 * set of tables + functions the repo's migrations create (minus what they drop)
 * and asserts each is present in prod via the Supabase Management API SQL endpoint
 * (HTTPS — the direct Postgres connection is unreliable on some networks; this
 * never needs it). Any declared-but-absent object is drift → the outage risk.
 *
 * FAIL CLOSED (decisions.md §6): no access token, unreachable API, unexpected
 * response, or unreadable migrations → non-zero. A guard that cannot verify must
 * fail, never pass. (The old gate's skip-green is exactly what let this rot.)
 *
 * ROLLOUT: ships DEFERRED (on guards-wired-allowlist, not yet in CI) until
 * SUPABASE_ACCESS_TOKEN is set as a repo secret and the existing drift is
 * reconciled; then wired into the blocking gate. Blocking + fail-closed is the end
 * state — see ADR-0034.
 *
 * Run it (from any clone, HTTPS only — no CLI, no Postgres):
 *   SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=pzvqxdgoztbfikfuifix node scripts/ci/check-db-objects-present.mjs
 *
 * Test-only seam (never set in CI/prod): DB_OBJECTS_PROD_FIXTURE points at a JSON
 * file [{ "kind":"table|function", "name":"…" }, …] standing in for the prod query,
 * so the derive+diff logic is exercisable without a live project.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "./_json.mjs";

const ROOT = process.env.DB_OBJECTS_ROOT
  ? resolve(process.env.DB_OBJECTS_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");
const ALLOWLIST_PATH = join(ROOT, "scripts/ci/db-objects-allowlist.json");
const CODE = "DB-OBJECTS-PRESENT-001";

// Set the exit code and unwind cleanly. We NEVER call process.exit() after a
// fetch: killing the process while the HTTPS socket is still closing triggers a
// libuv assertion on Windows. Setting exitCode + throwing a sentinel that main()
// swallows lets the event loop drain the socket and exit naturally.
const EXIT = Symbol("exit");
const fail = (msg, code = 2) => {
  console.error(`✖ ${CODE}: ${msg}`);
  process.exitCode = code;
  throw EXIT;
};

async function main() {
  // --- 1. Derive the declared object set from the migrations ----------------
  // Regexes are intentionally forgiving: quoted/unquoted, optional `public.`,
  // optional IF (NOT) EXISTS / OR REPLACE. We track CREATE and DROP for tables and
  // functions and take the final set = created − dropped. Objects the derivation
  // can't model (renames, ALTERs, generated names) live in the allowlist.
  const RE = {
    createTable: /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi,
    dropTable: /drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi,
    createFn: /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?/gi,
    dropFn: /drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi,
  };
  const collect = (re, sql, set, add) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(sql))) (add ? set.add : set.delete).call(set, m[1].toLowerCase());
  };

  let files;
  try {
    files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  } catch (e) {
    fail(`cannot read ${MIGRATIONS_DIR}: ${e.message}. Failing closed.`);
  }
  if (files.length === 0) fail("no migration files found — path moved? Failing closed.");

  const tables = new Set();
  const functions = new Set();
  for (const f of files.sort()) {
    // Strip block + line comments so a commented-out CREATE isn't counted.
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/--[^\n]*/g, " ");
    collect(RE.createTable, sql, tables, true);
    collect(RE.dropTable, sql, tables, false);
    collect(RE.createFn, sql, functions, true);
    collect(RE.dropFn, sql, functions, false);
  }

  // Allowlist: objects the derivation over-declares (renamed away, replaced by a
  // view, dropped out of band). A reviewed list; keep it shrinking.
  let allow = { tables: [], functions: [] };
  if (existsSync(ALLOWLIST_PATH)) {
    try {
      allow = readJson(ALLOWLIST_PATH);
    } catch (e) {
      fail(`allowlist is not valid JSON (${e.message}). Failing closed.`);
    }
  }
  for (const t of allow.tables ?? []) tables.delete(t.toLowerCase());
  for (const fn of allow.functions ?? []) functions.delete(fn.toLowerCase());

  // Zero-scan tripwire (decisions.md §6): we read migration files but derived NO objects.
  // Either the CREATE-table/function derivation regressed (a broken regex) or everything was
  // allowlisted away — in both cases there is nothing left to verify, and the success branch
  // below would print a vacuous "all 0 declared … exist" GREEN. That is the exact false-green
  // this gate replaces. Fail CLOSED instead: a gate that derived nothing to check must not pass.
  // The real repo derives hundreds of objects, so 0 is always a defect, never a valid state.
  if (tables.size + functions.size === 0)
    fail(
      `derived 0 objects from ${files.length} migration file(s) — the CREATE-table/function ` +
        `derivation is broken or everything is allowlisted. Failing closed rather than passing vacuously.`
    );

  // --- 2. What exists in prod (Management API, HTTPS) -----------------------
  const FIXTURE = process.env.DB_OBJECTS_PROD_FIXTURE?.trim();
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const ref = process.env.SUPABASE_PROJECT_REF?.trim();

  const PROD_QUERY =
    "select 'table' as kind, tablename as name from pg_tables where schemaname='public' " +
    "union all " +
    "select 'function' as kind, p.proname as name from pg_proc p " +
    "join pg_namespace n on n.oid = p.pronamespace where n.nspname='public';";

  let rows;
  if (FIXTURE) {
    rows = readJson(FIXTURE);
  } else {
    if (!token)
      fail(
        "SUPABASE_ACCESS_TOKEN not set — cannot verify prod. Failing closed (a guard that cannot check must fail, not skip). Generate a token at https://supabase.com/dashboard/account/tokens."
      );
    if (!ref) fail("SUPABASE_PROJECT_REF not set — cannot target a project. Failing closed.");
    let res;
    try {
      res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: PROD_QUERY }),
      });
    } catch (e) {
      fail(`Management API request failed: ${e.message}. Failing closed.`);
    }
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 200);
      fail(
        `Management API returned HTTP ${res.status}${body ? ` — ${body}` : ""}. Failing closed.`
      );
    }
    const json = await res.json().catch(() => null);
    if (!Array.isArray(json))
      fail("Management API response was not the expected array of rows. Failing closed.");
    rows = json;
  }

  const prodTables = new Set();
  const prodFunctions = new Set();
  for (const r of rows) {
    if (r.kind === "table") prodTables.add(String(r.name).toLowerCase());
    else if (r.kind === "function") prodFunctions.add(String(r.name).toLowerCase());
  }

  // --- 3. Diff: declared but ABSENT from prod = drift -----------------------
  const missingTables = [...tables].filter((t) => !prodTables.has(t)).sort();
  const missingFns = [...functions].filter((fn) => !prodFunctions.has(fn)).sort();

  if (missingTables.length === 0 && missingFns.length === 0) {
    console.log(
      `✓ ${CODE}: OK — all ${tables.size} declared tables and ${functions.size} declared functions exist in prod (${ref ?? "fixture"}).`
    );
    return;
  }

  console.error(
    `✖ ${CODE}: ${missingTables.length + missingFns.length} object(s) declared by committed migrations are MISSING from prod — ` +
      `a migration was committed but never applied (the outage class):`
  );
  for (const t of missingTables) console.error(`  - table    public.${t}`);
  for (const fn of missingFns) console.error(`  - function public.${fn}()`);
  console.error(
    `\nApply the missing migration(s) to prod (Supabase Dashboard → SQL Editor), or — if an object was ` +
      `intentionally renamed/dropped out of band — add it to ${ALLOWLIST_PATH} with a reason. See ADR-0034.`
  );
  process.exitCode = 1;
}

main().catch((e) => {
  if (e !== EXIT) {
    console.error(`✖ ${CODE}: unexpected error — ${e?.stack || e}`);
    process.exitCode = 2;
  }
});
