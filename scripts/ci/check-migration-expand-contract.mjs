#!/usr/bin/env node
// ci-lane: critical
/**
 * EXPAND-CONTRACT-001 — a migration must not make a destructive, in-place column change without
 * an explicit, reviewed contract annotation.
 *
 * WHY THIS EXISTS
 * ---------------
 * Migrations are hand/auto-applied and a migration can be live on prod WHILE the old app code is
 * still running (a `db push` is not atomic with the frontend/edge deploy — decisions.md §7,
 * supabase/migrations/CLAUDE.md, ADR-0026). So an in-place destructive change breaks the running old
 * code the instant it applies:
 *   - DROP COLUMN      — old SELECT/INSERT of that column errors
 *   - RENAME COLUMN    — old code referencing the old name errors
 *   - ALTER COLUMN ... TYPE / SET DATA TYPE — old reads/writes of the old type break
 *   - SET NOT NULL     — old inserts that omit the column fail
 * The expand/contract rule forbids these in an "expand" migration; a genuine contract runs LATER,
 * after all code paths stopped using the old shape. That rule was convention + reviewer only — no CI
 * guard caught a slip (enterprise-readiness audit 2026-10, C3). This guard makes a slip impossible to
 * merge unnoticed: any destructive column DDL must either be a pre-existing (grandfathered) migration
 * or carry an explicit `-- expand-contract-ok: <reason>` marker that a reviewer signs off on.
 *
 * Prevention: the marker forces the author to DECLARE "this is a reviewed contract; no running code
 * uses the old shape." This guard is the fail-closed backstop.
 *
 * ci-guard-integrity: bespoke-dir-reader — reads the flat supabase/migrations/*.sql list + their SQL
 * text for destructive-DDL patterns; not a recursive content scan of src, so it does not use _guard.mjs.
 * Fails CLOSED (exit 2) on a missing dir / zero migrations / unreadable allowlist.
 * Pinned by src/test/smoke/check-migration-expand-contract.smoke.test.ts.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
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

// Destructive, in-place column changes that break still-running old code.
const PATTERNS = [
  { re: /\bdrop\s+column\b/i, label: "DROP COLUMN" },
  { re: /\brename\s+column\b/i, label: "RENAME COLUMN" },
  { re: /\balter\s+column\b[^;]*\btype\b/i, label: "ALTER COLUMN ... TYPE" },
  { re: /\bset\s+not\s+null\b/i, label: "SET NOT NULL" },
];
const ANNOTATION = /--\s*expand-contract-ok:\s*\S+/i; // marker + a non-empty reason

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

/** Strip a trailing `-- ...` line comment so a pattern inside a comment is not a false hit. */
const stripComment = (line) => line.replace(/--.*$/, "");

const violations = [];
let grandfatheredHits = 0;
for (const f of files) {
  let src;
  try {
    src = readFileSync(resolve(MIGRATIONS, f), "utf8");
  } catch {
    continue;
  }
  const annotated = ANNOTATION.test(src);
  const lines = src.split("\n");
  const hits = [];
  lines.forEach((line, i) => {
    const code = stripComment(line);
    for (const { re, label } of PATTERNS) {
      if (re.test(code)) hits.push({ n: i + 1, label, line: line.trim() });
    }
  });
  if (hits.length === 0) continue;
  if (allow.has(f)) {
    grandfatheredHits++;
    continue; // pre-existing, tracked; allowed (shrink-only — see below)
  }
  if (annotated) continue; // reviewed, deliberate contract
  for (const h of hits) violations.push({ file: f, ...h });
}

// Shrink-only: the grandfather must never grow. A NEW destructive migration uses the annotation,
// never a new allowlist entry — so the count of files we skipped via the allowlist must not exceed
// the allowlist size, and any stale (no-longer-destructive) entry should be pruned.
const stale = [...allow].filter((f) => !files.includes(f));
if (stale.length) {
  console.error(
    `✖ check-migration-expand-contract: ${stale.length} grandfather entr(y/ies) no longer exist — prune them (shrink-only):`
  );
  for (const f of stale) console.error(`  - ${f}`);
  process.exit(1);
}

if (violations.length) {
  console.error(
    `✖ check-migration-expand-contract: ${violations.length} destructive in-place column change(s) with no contract annotation:`
  );
  for (const v of violations)
    console.error(`  supabase/migrations/${v.file}:${v.n}  ${v.label}\n      > ${v.line}`);
  console.error(
    `\nThis breaks still-running old code the instant it applies (decisions.md §7). Either split it into\n` +
      `expand (now) + contract (a later migration, once no code uses the old shape), or — if it IS a\n` +
      `reviewed contract — add a line \`-- expand-contract-ok: <why no running code uses the old shape>\`.`
  );
  process.exit(1);
}

console.log(
  `✓ check-migration-expand-contract: OK — ${files.length} migrations scanned; ` +
    `${grandfatheredHits} grandfathered, 0 un-annotated destructive column changes.`
);
