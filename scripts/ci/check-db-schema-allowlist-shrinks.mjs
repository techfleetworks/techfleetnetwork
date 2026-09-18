#!/usr/bin/env node
/**
 * DB-SCHEMA-ALLOWLIST-SHRINK-001 — the ADR-0036 drift allowlist may only SHRINK, mechanically.
 *
 * `scripts/ci/db-schema-allowlist.json` waives objects that committed migrations DECLARE but that
 * are ABSENT from prod (intentional design drift, or known drift pending reconciliation). Every
 * waiver REMOVES an object from the schema gate's prod verification (check-db-schema-present.mjs
 * subtracts it before the diff). So ADDING a waiver must be a deliberate, reviewed act — not a
 * silent JSON edit. decisions.md §6 makes this a categorical repo norm: every shrink-only burn-down
 * allowlist gets a MECHANICAL shrink guard, not prose (cf. check-edge-audit-wrapper-coverage's
 * ALLOWLIST, check-guard-has-test's, the dropped-supabase-error budget). This is that guard.
 *
 * CAPS below is the committed per-category ratchet. The guard requires each category's waiver count
 * to EQUAL its cap:
 *   - count > cap → a waiver was ADDED. Adding is allowed only by ALSO raising CAPS here in the same
 *                   PR — a visible line a reviewer sees ("we are removing N objects from prod
 *                   verification"). FAIL until that happens (or the waiver is dropped).
 *   - count < cap → burn-down happened (good). Lower CAPS to the new count so the freed headroom
 *                   cannot later be re-used silently. FAIL until the cap is decremented.
 * Equality (not `<=`) is deliberate: a high-water-mark cap would let a removed waiver's slot be
 * re-added with no review. So CAPS only ever ratchets DOWN; every upward move is a reviewed exception.
 * Complements the gate's own stale-waiver tripwire (which forces removal only AFTER an object is
 * applied to prod) — this gates ADDITIONS, which that does not.
 *
 * Fail-closed: missing/unreadable allowlist, or a waived category with no cap → exit 2. Bespoke
 * reader (one JSON, not a recursive scan) — listed in check-ci-guard-integrity's BESPOKE_DIR_READERS;
 * owns its own fail-closed + evidence. Pinned by
 * src/test/smoke/check-db-schema-allowlist-shrinks.smoke.test.ts.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "./_json.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ALLOWLIST = join(ROOT, "scripts/ci/db-schema-allowlist.json");

// Committed shrink-only ratchet, per category. Keep in lockstep with db-schema-allowlist.json.
// Lower a number when you burn a waiver down; RAISING one (to add a waiver) must be a reviewed line
// in the same PR. See docs/architecture/audit-2026-08/adr-0036-drift-reconciliation.md.
const CAPS = {
  table: 2, // tickets, ticket_events (INTENTIONAL — superseded ticket design)
  type: 2, // ticket_inbox_type, ticket_status (INTENTIONAL)
  rls_enabled: 2, // public.tickets, public.ticket_events (INTENTIONAL)
  index: 2, // DRIFT-A fleety_rearchitecture (pending reconcile)
  trigger: 2, // DRIFT-A fleety_rearchitecture (pending reconcile)
  column: 5, // DRIFT-A fleety (2) + DRIFT-B stats_drift_log (2) + DRIFT-C request_idempotency (1)
  policy: 1, // DRIFT-D project_roster (pending decision)
};

const die = (msg) => {
  console.error(`✖ check-db-schema-allowlist-shrinks: ${msg}`);
  process.exit(2);
};

if (!existsSync(ALLOWLIST)) die(`allowlist not found at ${ALLOWLIST}. Failing closed.`);
let allow;
try {
  allow = readJson(ALLOWLIST);
} catch (e) {
  die(`allowlist unreadable / invalid JSON at ${ALLOWLIST} (${e.message}). Failing closed.`);
}
if (!allow || typeof allow !== "object" || Array.isArray(allow))
  die(`allowlist is not a JSON object. Failing closed.`);

// Union of capped categories and every non-"_" key actually present (a waived category MUST have a
// cap; a burned-to-empty category keeps its cap until decremented to 0).
const cats = [
  ...new Set([...Object.keys(CAPS), ...Object.keys(allow).filter((k) => !k.startsWith("_"))]),
].sort();

const violations = [];
for (const cat of cats) {
  const cap = CAPS[cat];
  if (cap == null)
    die(
      `waived category '${cat}' has no CAPS entry — a capped ratchet must cover every waived category. ` +
        `Add CAPS.${cat} to scripts/ci/check-db-schema-allowlist-shrinks.mjs. Failing closed.`
    );
  const entries = allow[cat];
  if (entries != null && !Array.isArray(entries))
    die(`allowlist['${cat}'] is not an array. Failing closed.`);
  const count = Array.isArray(entries) ? entries.length : 0;
  if (count > cap)
    violations.push(
      `${cat}: ${count} waiver(s) but the committed cap is ${cap} — a waiver was ADDED. Adding one ` +
        `removes an object from prod verification, so it needs a reviewed cap bump: set CAPS.${cat} = ${count} ` +
        `in this guard IN THE SAME PR, or drop the new waiver from db-schema-allowlist.json.`
    );
  else if (count < cap)
    violations.push(
      `${cat}: ${count} waiver(s) but the committed cap is ${cap} — burn-down happened (good). ` +
        `Lower CAPS.${cat} = ${count} so the ratchet stays tight (freed slots can't be re-used silently).`
    );
}

if (violations.length) {
  console.error(
    `✖ check-db-schema-allowlist-shrinks: db-schema-allowlist.json is out of lockstep with its shrink ratchet:`
  );
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

const total = Object.values(CAPS).reduce((n, c) => n + c, 0);
console.log(
  `✓ check-db-schema-allowlist-shrinks: OK — ${total} waiver(s) across ${cats.length} categories, ` +
    `each at its shrink-only cap.`
);
process.exit(0);
