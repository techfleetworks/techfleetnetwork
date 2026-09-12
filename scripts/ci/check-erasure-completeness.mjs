#!/usr/bin/env node
/**
 * ERASURE-COMPLETENESS-001 — the WINNING handle_user_deletion() must erase/de-identify EVERY
 * registered PII table.
 *
 * WHY THIS EXISTS
 * ---------------
 * Right-to-erasure (GDPR Art. 17 / audit H9): deleting an auth user must leave no personal data
 * behind. `handle_user_deletion()` (BEFORE DELETE ON auth.users) is the entrypoint, and it is
 * CREATE-OR-REPLACE'd by MANY migrations over time. Because each redefinition replaces the WHOLE
 * function body, a later migration that "preserves existing cleanup verbatim" from a stale copy
 * silently DROPS whatever a back-dated migration added — which is exactly what
 * 20260812180000_handoff_dsar_retention did to 20260810130001_h9_complete_erasure_cascade's four
 * PII-orphan tables (cookie_consents, support_provisioning_log, support_ticket_events, and the
 * gumroad_sales user-link). The result was a LIVE erasure gap: deleted users' PII orphaned.
 *
 * This guard makes that class impossible to ship: it finds the LAST (highest-timestamp) migration
 * that defines handle_user_deletion and fails if the REQUIRED PII tables are not all present in it.
 *
 * Fail-closed: missing migrations dir / zero migrations / no definition at all → exit 2. Bespoke
 * reader (reads migration filenames + the one winning function body — not a recursive content scan);
 * listed in check-ci-guard-integrity's BESPOKE_DIR_READERS. Pinned by
 * src/test/smoke/check-erasure-completeness.smoke.test.ts. See ADR-0039.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Paths resolve from THIS file's location (no env seam that CI could be tricked into repointing);
// the smoke test copies this guard into a throwaway fixture repo and runs the copy.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIG_DIR = join(ROOT, "supabase/migrations");

// Every table whose user PII MUST be erased or de-identified in handle_user_deletion() on account
// deletion. Add one when a migration starts storing user PII WITHOUT an ON DELETE CASCADE FK; the
// guard then forces it to remain covered forever. Removing one is a reviewed decision (it moved to
// an FK cascade) — record the reason in the removing PR.
const REQUIRED = [
  "gumroad_sales", // financial ledger — de-identify (H9)
  "cookie_consents", // consent record — de-identify (H9)
  "support_provisioning_log", // append-only op log — erase (H9)
  "support_ticket_events", // append-only op log — erase (H9)
  "handoff_deliverable_submissions", // uploaded PII content (Wave-4 DSAR)
  "profiles", // baseline profile erase
  "user_roles",
  "notifications",
  "chat_conversations",
  "journey_progress",
  "project_applications",
  "general_applications",
];

const die = (msg) => {
  console.error(`✖ check-erasure-completeness: ${msg}`);
  process.exit(2);
};

if (!existsSync(MIG_DIR)) die(`migrations dir not found at ${MIG_DIR}. Failing closed.`);
let files;
try {
  files = readdirSync(MIG_DIR)
    .filter((f) => /^\d{14}_.*\.sql$/.test(f))
    .sort();
} catch (e) {
  die(`cannot read ${MIG_DIR}: ${e.message}. Failing closed.`);
}
if (!files.length) die(`no timestamped migrations found (zero-scan). Failing closed.`);

// The winning definition = the LAST (highest-timestamp) migration that CREATE-OR-REPLACEs the
// function. Migrations sort lexically by their 14-digit prefix, which is chronological.
const RE_DEF = /create\s+or\s+replace\s+function\s+public\.handle_user_deletion\s*\(/i;
let winner = null;
let winnerBody = null;
for (const f of files) {
  const sql = readFileSync(join(MIG_DIR, f), "utf8");
  const m = RE_DEF.exec(sql);
  if (!m) continue;
  const rest = sql.slice(m.index);
  const end = /\$function\$\s*;|\$\$\s*;/i.exec(rest); // dollar-quote terminator
  winner = f;
  winnerBody = end ? rest.slice(0, end.index) : rest;
}
if (!winner)
  die(`no migration defines public.handle_user_deletion — the erasure entrypoint is missing.`);

const missing = REQUIRED.filter((t) => !new RegExp(`\\b${t}\\b`).test(winnerBody));
if (missing.length) {
  console.error(
    `✖ check-erasure-completeness: the winning handle_user_deletion() (in ${winner}) omits ` +
      `${missing.length} REQUIRED PII table(s) — deleting a user would ORPHAN their personal data ` +
      `(GDPR right-to-erasure gap, audit H9):`
  );
  for (const t of missing) console.error(`  - ${t}`);
  console.error(
    `\nA redefinition replaces the WHOLE function, so omitting a table silently drops its erasure. ` +
      `Re-add the missing table(s) to the migration, or — only if a table moved to an ON DELETE ` +
      `CASCADE FK — remove it from REQUIRED in scripts/ci/check-erasure-completeness.mjs with a reason. See ADR-0039.`
  );
  process.exit(1);
}
console.log(
  `✓ check-erasure-completeness: handle_user_deletion() (in ${winner}) covers all ${REQUIRED.length} registered PII tables.`
);
process.exit(0);
