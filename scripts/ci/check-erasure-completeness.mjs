#!/usr/bin/env node
// ci-lane: critical
/**
 * ERASURE-COMPLETENESS-001 — every PII-bearing table must have a proven erasure path when an
 * auth user is deleted, and the full PII surface must be enumerated so none can hide.
 *
 * WHY THIS EXISTS (reaudit-2026-10-30 RH2 / CMP-2, supersedes the ADR-0039 hand list)
 * ------------------------------------------------------------------------------------
 * Right-to-erasure (GDPR Art. 17 / audit H9): deleting an auth user must leave no personal data
 * behind. The previous version of this guard proved that a hand-maintained list of 12 tables
 * appeared in the winning `handle_user_deletion()`. It passed GREEN while ~30 other PII tables
 * (certifications with email + raw Airtable data, outboxes, trusted_devices, passkeys, the
 * discord_role_grant_queue identity link, …) were never checked at all — the "gate can't see the
 * real surface" class this program exists to kill (reaudit CMP-2).
 *
 * WHAT THIS GUARD NOW PROVES
 * --------------------------
 * It derives the PII surface FROM THE SCHEMA, not from a hand list, and cross-checks it against a
 * committed registry (scripts/ci/pii-tables.json):
 *
 *   1. SCHEMA SCAN. Every `public` table created with a subject-identity uuid column
 *      (user_id / *_user_id) or an authorship column (created_by / owner_id) is a PII candidate.
 *   2. COVERAGE DERIVATION. A candidate is COVERED when it is erased/de-identified in the winning
 *      `handle_user_deletion()` body, OR its row is removed by an `ON DELETE CASCADE` chain that
 *      terminates at auth.users or an erased table. A cascade only counts as COMPLETE when it runs
 *      on the subject-identity column itself, OR through a NOT NULL FK column (so EVERY row
 *      cascades) — a nullable secondary cascade leaves the subject's NULL-FK rows orphaned
 *      (exactly the fleety_turn_signals gap CMP-2 named).
 *   3. REGISTRY CROSS-CHECK. Every candidate MUST appear in the registry, and the registry MUST NOT
 *      list a table that is no longer a candidate (so the map cannot rot). Each registry entry
 *      declares a coverage, which the guard VERIFIES against the derivation it cannot just trust:
 *        - "erased"  → must be erased in the winning body.
 *        - "cascade" → must be cascade-covered by the derivation above.
 *        - "orphan" / "retained" / "author-provenance" → an allow-list entry: the table is NOT
 *          auto-covered and is explicitly accounted for WITH A REASON (and, for a tracked gap, a
 *          tracking reference). This keeps the surface VISIBLE instead of invisibly green.
 *
 * It FAILS (exit 1) when a PII table is neither covered nor registered, when a registry entry lies
 * (claims erased/cascade the schema does not support) or has gone stale (claims a gap for a table
 * that is now covered), or when an allow-list entry has no reason. It FAILS CLOSED (exit 2) when a
 * precondition is missing: no migrations dir, zero migrations, no handle_user_deletion, no registry,
 * or zero candidates scanned (a misconfiguration must never read as a pass).
 *
 * SCOPE. Discord is the only integrated external processor today; external-processor deletion
 * (Discord/Freescout/Airtable/Braintrust) is held (reaudit RC0) and is NOT asserted here — this
 * guard proves LOCAL (Postgres) erasure completeness only.
 *
 * LIMITATION (named, not hidden). The derivation trusts migration-declared schema (columns, NOT
 * NULL, FK ON DELETE). Prod drift (FKs/constraints added outside migrations) is not assessed; a
 * blocking pgTAP catalog sweep against a live DB is the complementary runtime check (reaudit CMP-2
 * "Prevent"). Row-level predicates (e.g. a partial erase) are beyond a static reader.
 *
 * Bespoke reader (reads migration filenames + the one winning function body + the registry — NOT a
 * recursive content scan); listed in check-ci-guard-integrity's BESPOKE_DIR_READERS. Pinned by
 * src/test/smoke/check-erasure-completeness.smoke.test.ts (which runs the node discrimination
 * scenarios in scripts/ci/erasure-completeness-selftest.mjs). See docs/adr/20261106-erasure-completeness-registry.md.
 *
 * ci-guard-integrity: bespoke-dir-reader — ADR-20261106 right-to-erasure guard: reads migration filenames + the winning handle_user_deletion body + pii-tables.json (not a recursive content scan)
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Paths resolve from THIS file's location (no env seam that CI could be tricked into repointing);
// the smoke test copies this guard into a throwaway fixture repo and runs the copy.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const MIG_DIR = join(ROOT, "supabase/migrations");
const REGISTRY = join(HERE, "pii-tables.json");

const ALLOW = new Set(["orphan", "retained", "author-provenance"]);
const COVERAGE_VALUES = new Set(["erased", "cascade", ...ALLOW]);

const die = (msg) => {
  console.error(`✖ check-erasure-completeness: ${msg}`);
  process.exit(2);
};

// ── Preconditions: fail CLOSED ───────────────────────────────────────────────
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

if (!existsSync(REGISTRY)) die(`PII registry not found at ${REGISTRY}. Failing closed.`);
let registry;
try {
  registry = JSON.parse(readFileSync(REGISTRY, "utf8"));
} catch (e) {
  die(`cannot parse ${REGISTRY}: ${e.message}. Failing closed.`);
}
if (!registry || !Array.isArray(registry.tables)) die(`registry has no "tables" array. Failing closed.`);

// Strip SQL comments before any parsing so a trailing `-- ...` or a `/* ... */` can never hide a
// column, a DML target, or an FK from the scan (F1: a comment between a comma and the next column
// was hiding email_octopus_contact_sync's user_id). Naive strip (does not special-case a `--`
// inside a string literal — vanishingly rare in this DDL, and a false hit only ADDS scrutiny).
const stripSqlComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, "");
let sql;
try {
  sql = files.map((f) => stripSqlComments(readFileSync(join(MIG_DIR, f), "utf8")));
} catch (e) {
  die(`cannot read a migration file: ${e.message}. Failing closed.`);
}
const corpus = sql.join("\n");

// ── The winning handle_user_deletion() = the LAST (highest-timestamp) definition ─────
const RE_DEF = /create\s+or\s+replace\s+function\s+public\.handle_user_deletion\s*\(/i;
let winner = null;
let body = null;
for (let i = 0; i < files.length; i++) {
  const m = RE_DEF.exec(sql[i]);
  if (!m) continue;
  const rest = sql[i].slice(m.index);
  const end = /\$function\$\s*;|\$\$\s*;/i.exec(rest);
  winner = files[i];
  body = end ? rest.slice(0, end.index) : rest;
}
if (!winner) die(`no migration defines public.handle_user_deletion — the erasure entrypoint is missing.`);

// What the winning body does to each table, by statement kind. DELETE actually removes rows (so it
// can root a cascade chain); UPDATE de-identifies in place (the table's OWN PII is handled, but its
// rows REMAIN, so it can NOT cover a child via cascade); INSERT (e.g. audit_log) is neither — it
// must not read as erasure (F4).
const DELETED = new Set();
for (const mm of body.matchAll(/\bdelete\s+from\s+public\.([a-z0-9_]+)/gi)) DELETED.add(mm[1]);
const DEIDENT = new Set();
for (const mm of body.matchAll(/\bupdate\s+public\.([a-z0-9_]+)/gi)) DEIDENT.add(mm[1]);
// The table's OWN PII is handled when it is deleted or de-identified in the body.
const HANDLED_SELF = new Set([...DELETED, ...DEIDENT]);

// ── Schema scan: CREATE TABLE bodies + their identity columns ─────────────────
const RE_CT = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?("?)([a-z0-9_]+)\1\s*\(/gi;
const createBody = new Map();
for (const s of sql) {
  RE_CT.lastIndex = 0;
  let m;
  while ((m = RE_CT.exec(s))) {
    const name = m[2];
    // balanced-paren capture of the column list (CHECK(...) etc. keep the depth honest)
    let i = m.index + m[0].length - 1,
      depth = 0,
      start = i,
      end = -1;
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const b = end > start ? s.slice(start + 1, end) : "";
    if (!createBody.has(name)) createBody.set(name, b);
  }
}
const classify = (col) => {
  const c = col.toLowerCase();
  if (c === "user_id" || c.endsWith("_user_id")) return "subj";
  if (c === "created_by" || c === "owner_id") return "auth";
  return null;
};
// Identity columns per table: from the CREATE body AND from any later ALTER TABLE ADD COLUMN (F2:
// FK/NOT NULL detection already consult ALTER; identity detection must too, or an expand migration
// that adds `user_id` to an existing table escapes the gate).
const identity = new Map(); // table -> {subj:Set, auth:Set}
const idOf = (t) => identity.get(t) || { subj: new Set(), auth: new Set() };
for (const [name, b] of createBody) {
  const subj = new Set(),
    auth = new Set();
  for (const mm of b.matchAll(/(^|,|\()\s*"?([a-z0-9_]+)"?\s+uuid\b/gi)) {
    const k = classify(mm[2]);
    if (k === "subj") subj.add(mm[2].toLowerCase());
    else if (k === "auth") auth.add(mm[2].toLowerCase());
  }
  identity.set(name, { subj, auth });
}
for (const mm of corpus.matchAll(
  /alter\s+table\s+(?:only\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?\s+uuid\b/gi
)) {
  const k = classify(mm[2]);
  if (!k) continue;
  if (!identity.has(mm[1])) identity.set(mm[1], { subj: new Set(), auth: new Set() });
  identity.get(mm[1])[k].add(mm[2].toLowerCase());
}
const identityCols = (t) => ({ subj: [...idOf(t).subj], auth: [...idOf(t).auth] });
const candidates = [...identity.keys()].filter((t) => idOf(t).subj.size || idOf(t).auth.size);
candidates.sort();
if (!candidates.length) die(`scanned 0 PII candidate tables (zero-scan — scan logic broke?). Failing closed.`);

// ── FK edges with ON DELETE CASCADE, and NOT NULL detection ───────────────────
function colNotNull(child, col) {
  const b = createBody.get(child) || "";
  const line = (b.match(new RegExp("(^|,)\\s*\"?" + col + "\"?\\s+[a-z0-9_]+[^,]*", "i")) || [""])[0];
  if (/\bnot\s+null\b/i.test(line)) return true;
  if (/primary\s+key/i.test(line)) return true;
  if (new RegExp("primary\\s+key\\s*\\([^)]*\\b" + col + "\\b", "i").test(b)) return true;
  return new RegExp(
    "alter\\s+table[\\s\\S]{0,120}?" + child + "[\\s\\S]{0,120}?alter\\s+column\\s+\"?" + col + "\"?[\\s\\S]{0,40}?set\\s+not\\s+null",
    "i"
  ).test(corpus);
}
const norm = (p) => (/^auth\.users$/i.test(p) ? "AUTH" : p.replace(/^public\./i, ""));
const fks = []; // {child, col, parent, cascade}
for (const [child, b] of createBody) {
  for (const mm of b.matchAll(
    /(^|,|\()\s*"?([a-z0-9_]+)"?\s+uuid\b[^,]*?references\s+((?:auth\.)?[a-z0-9_.]+)\s*(?:\([^)]*\))?([^,]*)/gi
  ))
    fks.push({ child, col: mm[2], parent: norm(mm[3]), cascade: /on\s+delete\s+cascade/i.test(mm[4]) });
  for (const mm of b.matchAll(
    /foreign\s+key\s*\(\s*"?([a-z0-9_]+)"?\s*\)\s*references\s+((?:auth\.)?[a-z0-9_.]+)\s*(?:\([^)]*\))?([^,]*)/gi
  ))
    fks.push({ child, col: mm[1], parent: norm(mm[2]), cascade: /on\s+delete\s+cascade/i.test(mm[3]) });
}
for (const mm of corpus.matchAll(
  /alter\s+table\s+(?:only\s+)?(?:public\.)?"?([a-z0-9_]+)"?[\s\S]{0,200}?foreign\s+key\s*\(\s*"?([a-z0-9_]+)"?\s*\)\s*references\s+((?:auth\.)?[a-z0-9_.]+)\s*(?:\([^)]*\))?([\s\S]{0,80})/gi
))
  fks.push({ child: mm[1], col: mm[2], parent: norm(mm[3]), cascade: /on\s+delete\s+cascade/i.test(mm[4]) });

// ── Coverage closure (SAFE: no false "covered") ───────────────────────────────
// A table auto-counts as covered only when EVERY row about the data subject is provably removed
// when the user is deleted:
//   (a) a SUBJECT-identity column (user_id / *_user_id) ON DELETE CASCADE up to auth.users or an
//       erased table — the cascade follows the subject itself; OR
//   (b) the table has NO independent subject column (authorship-only, e.g. created_by) AND a
//       NOT NULL ON DELETE CASCADE FK to a covered parent — every row goes and there is no
//       separate subject column that could point at a DIFFERENT, non-cascaded user.
// A table that has a subject column but is cascaded only through a NON-identity FK (e.g.
// class_audit.actor_user_id, removed only via class_id -> the class OWNER) is deliberately NOT
// auto-covered: the actor's rows on someone else's parent would orphan. Such a table must be an
// explicit "cascade" registry entry WITH A REASON affirming the parent is the same subject, or be
// classified as a gap. This is the false-"covered" hole that would let real PII pass green.
// A cascade only removes rows when its parent's rows are themselves removed (DELETE or a cascade
// up to auth.users), so the parent set is REMOVAL — NOT a de-identified (UPDATE) parent, whose rows
// remain (F4).
function structuralCascade(child, subjOnlyNull) {
  // returns the removal-covered parent reached by a qualifying cascade FK, else null
  const { subj } = identityCols(child);
  for (const c of subj)
    for (const e of fks)
      if (e.child === child && e.col === c && e.cascade && (e.parent === "AUTH" || REMOVAL.has(e.parent))) return e.parent; // rule (a)
  if (!subjOnlyNull || subj.length === 0)
    for (const e of fks)
      if (e.child === child && e.cascade && (e.parent === "AUTH" || REMOVAL.has(e.parent)) && colNotNull(child, e.col))
        return e.parent; // rule (b) structural
  return null;
}
// REMOVAL = tables whose rows are actually removed when the user is deleted (DELETE roots + their
// safe cascade closure). COVERED (for classification) adds the de-identified tables, whose OWN PII
// is handled even though their rows stay.
const REMOVAL = new Set(DELETED);
let changed = true;
while (changed) {
  changed = false;
  for (const child of candidates) {
    if (REMOVAL.has(child)) continue;
    // subjOnlyNull=true: rule (b) only auto-covers tables with NO independent subject column.
    if (structuralCascade(child, true)) {
      REMOVAL.add(child);
      changed = true;
    }
  }
}

// A table's PII is handled when its OWN rows are erased/de-identified in the body, or its rows are
// removed by a cascade chain.
const COVERED = new Set([...HANDLED_SELF, ...REMOVAL]);

// ── Cross-check the registry against the derived surface ──────────────────────
const byTable = new Map();
const problems = [];
for (const e of registry.tables) {
  if (!e || typeof e.table !== "string") {
    problems.push(`registry has an entry with no "table" string.`);
    continue;
  }
  if (byTable.has(e.table)) problems.push(`${e.table}: duplicate registry entry.`);
  byTable.set(e.table, e);
  if (!COVERAGE_VALUES.has(e.coverage))
    problems.push(`${e.table}: unknown coverage "${e.coverage}" (expected one of ${[...COVERAGE_VALUES].join(", ")}).`);
}

const candidateSet = new Set(candidates);
// (1) every PII candidate must be registered
for (const t of candidates)
  if (!byTable.has(t))
    problems.push(
      `${t}: PII-bearing table (identity column ${identityCols(t).subj.concat(identityCols(t).auth).join("/")}) is NOT in scripts/ci/pii-tables.json — classify it (erased/cascade/orphan/retained/author-provenance with a reason).`
    );
// (2) registry must not list a table that is no longer a PII candidate (anti-rot)
for (const [t] of byTable)
  if (!candidateSet.has(t))
    problems.push(`${t}: registry lists a table that is no longer a PII candidate in the schema — remove the stale entry.`);

// (3) verify each entry's declared coverage against the derivation
for (const t of candidates) {
  const e = byTable.get(t);
  if (!e || !COVERAGE_VALUES.has(e.coverage)) continue; // already reported
  const erased = HANDLED_SELF.has(t); // deleted OR de-identified in the winning body
  const covered = COVERED.has(t);
  if (e.coverage === "erased" && !erased)
    problems.push(`${t}: registry claims "erased" but the winning handle_user_deletion() (in ${winner}) does not erase or de-identify it.`);
  if (e.coverage === "cascade") {
    if (erased)
      problems.push(`${t}: registry claims "cascade" but the table is erased in handle_user_deletion() — use "erased".`);
    else if (covered) {
      // auto-covered by a SAFE rule (identity cascade, or authorship-only NOT NULL cascade) — fine.
    } else if (structuralCascade(t, false)) {
      // covered only via a NON-identity cascade while the table has its own subject column: the
      // registry affirms the parent is the same subject — demand a reason for that affirmation.
      if (typeof e.reason !== "string" || e.reason.trim().length < 20)
        problems.push(
          `${t}: "cascade" holds only through a non-identity FK (the subject column does not itself cascade) — add a "reason" affirming the cascade parent belongs to the same data subject.`
        );
    } else {
      problems.push(
        `${t}: registry claims "cascade" but no NOT NULL / identity ON DELETE CASCADE chain to auth.users or an erased table was found.`
      );
    }
  }
  if (ALLOW.has(e.coverage)) {
    if (covered)
      problems.push(
        `${t}: registry claims "${e.coverage}" (a gap) but the table is now COVERED by erasure/cascade — promote the entry to "${erased ? "erased" : "cascade"}".`
      );
    if (typeof e.reason !== "string" || e.reason.trim().length < 20)
      problems.push(`${t}: coverage "${e.coverage}" requires a substantive "reason" (>= 20 chars) explaining the disposition.`);
  }
}

if (problems.length) {
  console.error(
    `✖ check-erasure-completeness: ${problems.length} PII erasure-completeness problem(s) — deleting a user could ORPHAN personal data, or the registry no longer reflects the schema (GDPR right-to-erasure, reaudit CMP-2):\n`
  );
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `\nThe winning handle_user_deletion() is in ${winner}. Fix by: adding the erase/de-identify to that migration or an ON DELETE CASCADE FK, or registering the table in scripts/ci/pii-tables.json with a coverage and a reason. See docs/adr/20261106-erasure-completeness-registry.md.`
  );
  process.exit(1);
}

const counts = {};
for (const e of registry.tables) counts[e.coverage] = (counts[e.coverage] || 0) + 1;
const gaps = registry.tables.filter((e) => e.coverage === "orphan" || e.coverage === "retained").map((e) => e.table);
console.log(
  `✓ check-erasure-completeness: ${candidates.length} PII tables enumerated and reconciled with handle_user_deletion() (in ${winner}).`
);
console.log(
  `  coverage: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join("  ")}`
);
if (gaps.length)
  console.log(
    `  known tracked gaps (orphan/retained, not silently green — see pii-tables.json reasons): ${gaps.length} table(s).`
  );
process.exit(0);
