#!/usr/bin/env node
/**
 * CI guard for Part 1 §1.1 — Audit-log tri-partite sink architecture.
 *
 * Verifies that every public-schema table has an explicit row in
 * `public.audit_sink_registry`. Without this guard, a newly added table can
 * silently double-write into audit_log (KPI #1 regresses) or fan out into
 * notifications without dedupe (KPI #11 regresses).
 *
 * Usage (CI):
 *   node scripts/ci/check-audit-sink-coverage.mjs
 *
 * Auth: reads PG* env vars (already set in CI sandbox). In environments
 * without psql we exit 0 with a warning so local dev is not blocked.
 */

import { execSync } from "node:child_process";

function hasPsql() {
  try {
    execSync("psql --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function q(sql) {
  return execSync(`psql -At -F$'\\t' -c ${JSON.stringify(sql)}`, {
    encoding: "utf8",
  }).trim();
}

if (!hasPsql() || !process.env.PGHOST) {
  // Fail closed under CI: a real CI run must never silently skip this guard.
  if (process.env.CI) {
    console.error(
      "[audit-sink-coverage] FAIL — running under CI but psql/PGHOST is not available; " +
        "a required guard must not silently skip in CI (fix the CI DB env)."
    );
    process.exit(1);
  }
  console.warn("[audit-sink-coverage] psql/PGHOST not available — skipping (local dev only).");
  process.exit(0);
}

const publicTables = q(`
  SELECT tablename FROM pg_tables
  WHERE schemaname='public'
    AND tablename NOT LIKE 'pg_%'
    AND tablename NOT LIKE '_realtime%'
  ORDER BY 1
`)
  .split("\n")
  .filter(Boolean);

// Fail closed: an empty discovery set means a broken connection or wrong
// search_path, NOT a clean schema — never let that read as a pass.
if (publicTables.length === 0) {
  console.error(
    "[audit-sink-coverage] FAIL — discovery query returned 0 public tables. " +
      "This indicates a broken DB connection or wrong schema/search_path, not an empty database."
  );
  process.exit(1);
}

const registered = new Set(
  q(`SELECT table_name FROM public.audit_sink_registry`).split("\n").filter(Boolean)
);

const missing = publicTables.filter((t) => !registered.has(t));

if (missing.length) {
  console.error(
    "\n[audit-sink-coverage] FAIL — these tables have no row in audit_sink_registry:\n"
  );
  for (const t of missing) console.error(`  • ${t}`);
  console.error(
    "\nFix: add a migration with INSERT INTO public.audit_sink_registry (table_name, mode, sink, notes) VALUES (...)."
  );
  console.error(
    "Pick mode 'semantic' if you audit specific events, 'none' if no audit, 'generic' only as a transitional escape hatch.\n"
  );
  process.exit(1);
}

console.log(
  `[audit-sink-coverage] OK — ${publicTables.length} public tables scanned, ` +
    `${registered.size} registered in audit_sink_registry, 0 unregistered.`
);
