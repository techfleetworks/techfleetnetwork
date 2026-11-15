#!/usr/bin/env node
// ci-lane: critical
/**
 * EXPAND-CONTRACT-001 — a migration must not make a destructive or lock-taking schema change that
 * breaks still-running old code mid-deploy, without an explicit, reviewed contract annotation.
 *
 * WHY THIS EXISTS
 * ---------------
 * Migrations are hand/auto-applied and a migration can be live on prod WHILE the old app code is
 * still running (a `db push` is not atomic with the frontend/edge deploy — decisions.md §7,
 * supabase/migrations/CLAUDE.md, ADR-0026). So a destructive or blocking change breaks the running
 * old code — or takes a lock that stalls live traffic — the instant it applies. The expand/contract
 * rule forbids these in an "expand" migration; a genuine contract runs LATER, after all code paths
 * stopped using the old shape. That rule was convention + reviewer only.
 *
 * ORIGINAL SCOPE (pre-2026-11): this guard caught only four in-place column changes — DROP COLUMN,
 * RENAME COLUMN, ALTER COLUMN … TYPE, SET NOT NULL — and matched them a LINE at a time, so a
 * statement split across lines (e.g. a multi-line TYPE change) slipped through, and a whole file
 * could be waved through by one file-level annotation. The enterprise re-audit (2026-10-30, REL-4 /
 * DB-3) found the real unsafe surface is wider; this guard now covers the full expand/contract rule
 * set from release-deployment-safety (references/zero-downtime-db-migrations.md), matches a STATEMENT
 * at a time (multi-line safe), and requires a PER-STATEMENT annotation. See ADR 20261110.
 *
 * WHAT IS FLAGGED (each breaks running old code or takes a blocking lock on a populated table):
 *   DROP TABLE / TRUNCATE          — destructive, usually irreversible
 *   DROP COLUMN / RENAME COLUMN    — old SELECT/INSERT of the old name/column errors
 *   RENAME TO (table)              — old code referencing the old table name errors
 *   DROP FUNCTION                  — old RPC callers of the function error (signature/removal change)
 *   ALTER COLUMN … TYPE            — in-place rewrite + lock; old reads/writes of the old type break
 *   SET NOT NULL (bare)            — full-table scan under lock
 *   ADD … NOT NULL without DEFAULT — insert by old code (and the backfill) fails/locks
 *   ADD CHECK / FOREIGN KEY        — validates existing rows under lock (unless NOT VALID)
 *   CREATE INDEX (non-CONCURRENT)  — ACCESS EXCLUSIVE lock blocks writes (safe on a brand-new table)
 *
 * PREVENTION: a destructive statement must either be pre-existing (grandfathered, shrink-only) or
 * carry an inline `-- expand-contract-ok: <reason>` on that statement — forcing the author to DECLARE
 * "this is a reviewed contract; no running code uses the old shape / this lock is acceptable." Scope
 * a waiver to one rule with `-- expand-contract-ok=<rule>: <reason>` (e.g. `=index-not-concurrent`).
 * A brand-new-table index or constraint (the table is CREATEd in the same migration) is auto-safe and
 * not flagged.
 *
 * ci-guard-integrity: bespoke-dir-reader — reads the flat supabase/migrations/*.sql list + their SQL
 * text for destructive/lock-taking DDL; not a recursive content scan of src, so it does not use
 * _guard.mjs. It is a statement linter, not a SQL parser: for the forms it covers it OVER-flags rather
 * than under-flags (the inline annotation is the escape hatch), but it is NOT a universal safety net —
 * a DDL form outside the rule set (e.g. DROP VIEW / DROP TRIGGER / DROP TYPE) is out of scope, and a `;`
 * inside a `$$ … $$` function body can mis-split (over-flag only). It does not read Postgres search_path,
 * so an unqualified table name is assumed to live in `public`. Fails CLOSED (exit 2) on a missing dir /
 * zero migrations / unreadable allowlist.
 * Pinned by src/test/smoke/check-migration-expand-contract.smoke.test.ts.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.EXPAND_CONTRACT_ROOT
  ? resolve(process.env.EXPAND_CONTRACT_ROOT)
  : resolve(HERE, "..", "..");
const MIGRATIONS = resolve(ROOT, "supabase", "migrations");
const ALLOWLIST_FILE =
  process.env.EXPAND_CONTRACT_ALLOWLIST ||
  resolve(HERE, "migration-expand-contract-grandfather.json");

const die = (msg) => {
  console.error(`✖ check-migration-expand-contract: ${msg}`);
  process.exit(2);
};

// Destructive / lock-taking DDL. `unless` (when present and matched) clears the hit — this is what a
// flat forbidden-regex can't express (NOT NULL is fine WITH a DEFAULT; a FK is fine NOT VALID; an
// index is fine CONCURRENTLY). `newTableSafe` (when present) captures the target table; if that table
// is CREATEd in the same migration, the statement is safe (no running code, no data to lock) and
// skipped. Postgres/Supabase dialect only (no MySQL CHANGE/MODIFY — this repo is Postgres).
const RULES = [
  { name: "drop-table", re: /\bDROP\s+TABLE\b/i,
    why: "DROP TABLE is destructive. Contract in a LATER release, after a backup + call-out." },
  { name: "truncate", re: /\bTRUNCATE\b/i,
    why: "TRUNCATE is destructive and usually irreversible. Needs a backup + call-out." },
  // Postgres makes COLUMN optional: `DROP col`, `DROP COLUMN col`, `DROP [COLUMN] IF EXISTS col`. The
  // negative lookahead excludes the standalone object drops (handled by their own rules) and the SAFE
  // sub-clauses (DROP CONSTRAINT/DEFAULT/NOT NULL/IDENTITY/EXPRESSION), so only a real column removal fires.
  { name: "drop-column", re: /\bDROP\s+(?!TABLE\b|FUNCTION\b|VIEW\b|INDEX\b|TYPE\b|TRIGGER\b|SCHEMA\b|POLICY\b|SEQUENCE\b|MATERIALIZED\b|EXTENSION\b|PUBLICATION\b|SUBSCRIPTION\b|OWNED\b|ROLE\b|DATABASE\b|CONSTRAINT\b|DEFAULT\b|NOT\b|IDENTITY\b|EXPRESSION\b)(COLUMN\s+)?(IF\s+EXISTS\s+)?"?\w/i,
    why: "stop writing, stop reading, deploy, THEN drop in a later release (confirm nothing reads it)." },
  // COLUMN is optional in RENAME too: `RENAME a TO b` (column), `RENAME COLUMN a TO b`, `RENAME TO t2` (table).
  { name: "rename-col-or-table", re: /\bRENAME\s+(COLUMN\s+)?(?:"?[\w.]+"?\s+)?TO\b/i,
    why: "a direct rename breaks running old code instantly. Add new → dual-write → backfill → switch → drop old." },
  { name: "drop-function", re: /\bDROP\s+FUNCTION\b/i,
    why: "old RPC callers of the function break. Use CREATE OR REPLACE for a same-signature change; for a real removal/signature change, drop in a LATER release once no code calls it." },
  { name: "add-not-null-no-default", re: /\bADD\s+(COLUMN\s+)?(?!CONSTRAINT\b)[^;]*\bNOT\s+NULL\b/i, unless: /\b(DEFAULT|GENERATED|NOT\s+VALID)\b/i,
    why: "NOT NULL without a DEFAULT on a populated table fails/locks and breaks old inserts. Add it nullable or with a default, then tighten." },
  { name: "set-not-null-direct", re: /\bSET\s+NOT\s+NULL\b/i,
    why: "a bare SET NOT NULL scans the whole table under lock. Use CHECK … NOT VALID → VALIDATE → SET NOT NULL; the final SET NOT NULL is textually identical, so waive it with an inline reason noting the prior validated CHECK." },
  // COLUMN optional: `ALTER COLUMN c TYPE …` and `ALTER c TYPE …`. The `\S+` + TYPE adjacency keeps a
  // column literally named "type" (e.g. `ALTER COLUMN type SET DEFAULT …`) from being mistaken for one.
  { name: "alter-column-type", re: /\bALTER\s+(COLUMN\s+)?\S+\s+(SET\s+DATA\s+)?TYPE\b/i,
    why: "an in-place type change rewrites + locks the table and breaks old code. Add a new column → backfill → switch → drop." },
  { name: "fk-check-not-valid", re: /\bADD\s+(CONSTRAINT\s+\S+\s+)?(CHECK|FOREIGN\s+KEY)\b/i, unless: /\bNOT\s+VALID\b/i,
    newTableSafe: /\bALTER\s+TABLE\s+(?:ONLY\s+)?("?[\w.]+"?)/i,
    why: "adding a CHECK or FOREIGN KEY validates existing rows under lock. Add it NOT VALID, then VALIDATE CONSTRAINT in a separate step." },
  { name: "index-not-concurrent", re: /\bCREATE\s+(UNIQUE\s+)?INDEX\b/i, unless: /\bCONCURRENTLY\b/i,
    newTableSafe: /\bON\s+(?:ONLY\s+)?("?[\w.]+"?)/i,
    why: "a non-CONCURRENT index build takes an ACCESS EXCLUSIVE lock that blocks writes. Use CREATE INDEX CONCURRENTLY (safe on a brand-new table — that case is auto-allowed)." },
];

// A migration dated on/after the guard-widening may NOT be grandfathered — it must carry an inline
// annotation instead. This makes "shrink-only" mechanical: a new violator cannot be waved through by
// appending its filename to the allowlist (re-audit F-3). Pre-widening files all sort before this.
const GRANDFATHER_CUTOFF = 20261110;
const leadingDate = (f) => {
  const m = /^(\d{8})/.exec(f);
  return m ? Number(m[1]) : 0;
};

let allow;
try {
  const raw = readFileSync(ALLOWLIST_FILE, "utf8").replace(/^﻿/, "");
  allow = new Set(JSON.parse(raw).grandfathered ?? []);
} catch (e) {
  die(`cannot read/parse allowlist ${ALLOWLIST_FILE}: ${e.message}. Failing closed.`);
}

let files;
try {
  files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
} catch (e) {
  die(`cannot read migrations dir ${MIGRATIONS}: ${e.message}. Failing closed.`);
}
if (files.length === 0) die(`no .sql migrations under ${MIGRATIONS} — wrong root? Failing closed.`);

/** Strip block then line comments so a pattern inside a comment is never a hit. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
/** Blank single-quoted string literals so a keyword inside a string value can't trip a rule. */
const blankStrings = (s) => s.replace(/'(?:[^']|'')*'/g, "''");

/**
 * Split a file into statements on ';', tracking the 1-based start line. A ';' extends its statement to
 * the END OF ITS LINE, so a trailing `-- …` (incl. a trailing `-- expand-contract-ok:`) binds to the
 * statement it follows, not the next one. (Ported from release-deployment-safety/check-migration-safety.)
 */
function statements(text) {
  const out = [];
  let start = 0, line = 1, startLine = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") { line++; continue; }
    if (text[i] === ";") {
      let j = i + 1;
      while (j < text.length && text[j] !== "\n") j++;
      out.push({ raw: text.slice(start, j), line: startLine });
      if (j < text.length) { line++; start = j + 1; startLine = line; }
      else start = j;
      i = j;
    }
  }
  if (start < text.length && text.slice(start).trim()) out.push({ raw: text.slice(start), line: startLine });
  return out;
}

/**
 * Inline waivers in a statement's RAW text. `all` = `-- expand-contract-ok: <reason>`; `rules` =
 * `-- expand-contract-ok=<rule>: <reason>`. Scanned per LINE so the required reason sits on the
 * directive's own line — a bare marker could otherwise swallow the next line's SQL as its "reason".
 */
function waivers(rawStmt) {
  const out = { all: false, rules: new Set() };
  const re = /--\s*expand-contract-ok(?:=([\w-]+))?\s*:\s*(\S.*)$/i;
  for (const line of rawStmt.split(/\r?\n/)) {
    const m = line.match(re);
    if (!m) continue;
    if ((m[2] || "").trim().length < 3) continue; // unexplained waiver does not suppress
    if (m[1]) out.rules.add(m[1].toLowerCase()); else out.all = true;
  }
  return out;
}

// Normalize a table reference to a schema-qualified, lowercased key; unqualified names default to the
// `public` schema (this repo is Supabase/public). Keeping the schema prevents a cross-schema same-name
// collision (audit.t created → index on public.t) from being treated as a new-table.
const qualify = (raw) => {
  const parts = raw.replace(/"/g, "").toLowerCase().split(".");
  const name = parts[parts.length - 1];
  const schema = parts.length >= 2 ? parts[parts.length - 2] : "public";
  return `${schema}.${name}`;
};
/** Tables CREATEd in this migration — an index/constraint on one of them is safe (no running code / no data). */
function createdTables(cleanText) {
  const set = new Set();
  const re = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w.]+"?)/gi;
  let m;
  while ((m = re.exec(cleanText))) set.add(qualify(m[1]));
  return set;
}
const tableOf = (sql, re) => {
  const m = sql.match(re);
  return m ? qualify(m[m.length - 1]) : null;
};

/** Un-annotated, non-new-table destructive hits for one file. Shared by the violation and shrink paths. */
function hitsFor(text) {
  // Blank string literals BEFORE scanning for CREATE TABLE, so a `CREATE TABLE …` inside a string value
  // cannot poison the new-table set and auto-allow an index/FK on a genuinely pre-existing table.
  const created = createdTables(blankStrings(stripComments(text)));
  const hits = [];
  for (const stmt of statements(text)) {
    const sql = blankStrings(stripComments(stmt.raw));
    if (!sql.trim()) continue;
    const w = waivers(stmt.raw);
    if (w.all) continue;
    for (const rule of RULES) {
      if (!rule.re.test(sql)) continue;
      if (rule.unless && rule.unless.test(sql)) continue;
      if (rule.newTableSafe) {
        const t = tableOf(sql, rule.newTableSafe);
        if (t && created.has(t)) continue;
      }
      if (w.rules.has(rule.name)) continue;
      hits.push({ n: stmt.line, label: rule.name, why: rule.why, line: stmt.raw.trim().split("\n")[0].trim() });
    }
  }
  return hits;
}

const violations = [];
const staleGrandfather = [];
let grandfatheredHits = 0;
for (const f of files) {
  let text;
  try { text = readFileSync(resolve(MIGRATIONS, f), "utf8"); }
  catch { continue; }
  const hits = hitsFor(text);
  if (allow.has(f)) {
    if (hits.length === 0) staleGrandfather.push(f); // fixed/annotated since — prune (shrink-only)
    else grandfatheredHits++;
    continue;
  }
  for (const h of hits) violations.push({ file: f, ...h });
}

// Shrink-only, mechanical: a NEW migration (dated on/after the widening) may not be grandfathered — it
// must annotate. This blocks "append the new violator's filename to the allowlist" structurally.
const tooNew = [...allow].filter((f) => leadingDate(f) >= GRANDFATHER_CUTOFF);
if (tooNew.length) {
  console.error(
    `✖ check-migration-expand-contract: ${tooNew.length} grandfather entr(y/ies) are dated on/after ${GRANDFATHER_CUTOFF} — a new migration must carry an inline \`-- expand-contract-ok: <reason>\`, not a grandfather entry (shrink-only):`
  );
  for (const f of tooNew) console.error(`  - ${f}`);
  process.exit(1);
}

// Shrink-only: an allowlist entry whose file is gone, OR that no longer has any un-annotated hit, must
// be pruned. The grandfather is the backlog — it may only shrink.
const missing = [...allow].filter((f) => !files.includes(f));
const stale = [...missing, ...staleGrandfather];
if (stale.length) {
  console.error(
    `✖ check-migration-expand-contract: ${stale.length} grandfather entr(y/ies) are stale — prune them (shrink-only):`
  );
  for (const f of missing) console.error(`  - ${f}  (file no longer exists)`);
  for (const f of staleGrandfather) console.error(`  - ${f}  (no longer has an un-annotated destructive statement)`);
  process.exit(1);
}

if (violations.length) {
  console.error(
    `✖ check-migration-expand-contract: ${violations.length} destructive/lock-taking change(s) with no contract annotation:`
  );
  for (const v of violations)
    console.error(`  supabase/migrations/${v.file}:${v.n}  [${v.label}] ${v.why}\n      > ${v.line}`);
  console.error(
    `\nThis breaks still-running old code — or takes a blocking lock — the instant it applies (decisions.md §7).\n` +
      `Either split it into expand (now) + contract (a later migration, once no code uses the old shape), or — if\n` +
      `it IS a reviewed contract / acceptable lock — add \`-- expand-contract-ok: <why it is safe>\` to that\n` +
      `statement (scope to one rule with \`-- expand-contract-ok=<rule>: <why>\`).`
  );
  process.exit(1);
}

console.log(
  `✓ check-migration-expand-contract: OK — ${files.length} migrations scanned; ` +
    `${grandfatheredHits} grandfathered, 0 un-annotated destructive/lock-taking changes.`
);
