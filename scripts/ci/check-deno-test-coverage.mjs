#!/usr/bin/env node
// ci-lane: critical
/**
 * DENO-TEST-COVERAGE-001 — every edge-function test must actually run in CI.
 *
 * WHY THIS EXISTS
 * ---------------
 * The `deno-check` job runs `deno test` over a HAND-MAINTAINED list of files in ci.yml. The 2026-10-30
 * re-audit (TST-2) found that list covered only a subset of `supabase/functions/**\/*.test.ts` — the rest
 * were committed but never executed, so they proved nothing and silently rotted, and a NEW test is unrun
 * until someone remembers to add it to the list. A test that never runs is worse than no test: it reads
 * as coverage while catching nothing (comprehensive-test-strategy: an un-run test is a false green).
 *
 * This guard makes an un-run test impossible to add silently: every `*.test.ts` under supabase/functions
 * must either be referenced by the ci.yml `deno test` invocation (so CI runs it) or sit on the
 * SHRINK-ONLY backlog (scripts/ci/deno-test-exclusions.json) — the known-unwired tests from before this
 * guard, each to be burned down by wiring it. A new test file in neither place reds the build.
 *
 * ci-guard-integrity: bespoke-dir-reader — walks supabase/functions for *.test.ts and reads ci.yml +
 * its own allowlist (a targeted file set, not a recursive src content scan), so it does not use
 * _guard.mjs. Fails CLOSED (exit 2) on a missing functions dir / missing ci.yml / zero test files /
 * unreadable allowlist. Pinned by src/test/smoke/check-deno-test-coverage.smoke.test.ts.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const FUNCTIONS_DIR = process.env.DENO_COV_FUNCTIONS_DIR
  ? resolve(process.env.DENO_COV_FUNCTIONS_DIR)
  : resolve(ROOT, "supabase", "functions");
const CI_FILE = process.env.DENO_COV_CI_FILE
  ? resolve(process.env.DENO_COV_CI_FILE)
  : resolve(ROOT, ".github", "workflows", "ci.yml");
const EXCL_FILE = process.env.DENO_COV_EXCL
  ? resolve(process.env.DENO_COV_EXCL)
  : resolve(HERE, "deno-test-exclusions.json");

const die = (msg) => {
  console.error(`✖ check-deno-test-coverage: ${msg}`);
  process.exit(2);
};

/** Forward-slash path beginning at "supabase/functions". */
const toRel = (abs) => {
  const u = abs.split(/[\\/]/).join("/");
  const i = u.indexOf("supabase/functions");
  return i >= 0 ? u.slice(i) : u;
};

const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage"]);
function walk(dir) {
  let out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      out = out.concat(walk(resolve(dir, e.name)));
    } else if (e.name.endsWith(".test.ts")) out.push(resolve(dir, e.name));
  }
  return out;
}

/**
 * The `deno test` command runs FILE args and DIRECTORY args (`deno test .../foo/` runs every *.test.ts
 * under foo/). Extract both, scoped to the `deno test` command block(s) only — a path mentioned in a
 * comment, a `paths:` filter, a cache key, or the typecheck-only `deno check` step must NOT count as run.
 */
function denoTestRefs(ciText) {
  const lines = ciText.split(/\r?\n/);
  const files = new Set();
  const dirs = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/\bdeno\s+test\b/.test(lines[i])) continue;
    // Gather this backslash-continued command: the match line + following lines while the previous ends with `\`.
    let block = lines[i];
    let j = i;
    while (/\\\s*$/.test(lines[j]) && j + 1 < lines.length) {
      block += "\n" + lines[j + 1];
      j++;
    }
    for (const tok of block.split(/[\s\\]+/)) {
      const t = tok.trim();
      if (/^supabase\/functions\/\S+\.test\.ts$/.test(t)) files.add(t);
      else if (/^supabase\/functions\/\S+\/$/.test(t)) dirs.push(t);
    }
  }
  return { files, dirs };
}

let testFiles;
try {
  testFiles = walk(FUNCTIONS_DIR).map(toRel).sort();
} catch (e) {
  die(`cannot read functions dir ${FUNCTIONS_DIR}: ${e.message}. Failing closed.`);
}
if (testFiles.length === 0) die(`no *.test.ts under ${FUNCTIONS_DIR} — wrong dir? Failing closed.`);

let ci;
try {
  ci = readFileSync(CI_FILE, "utf8");
} catch (e) {
  die(`cannot read ${CI_FILE}: ${e.message}. Failing closed.`);
}
// A test is run by CI if the `deno test` command names it explicitly OR names a directory that contains it.
const { files: refFiles, dirs: refDirs } = denoTestRefs(ci);
const isReferenced = (f) => refFiles.has(f) || refDirs.some((d) => f.startsWith(d));

let excluded;
try {
  const raw = readFileSync(EXCL_FILE, "utf8").replace(/^﻿/, "");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.excluded)) {
    die(`exclusions ${EXCL_FILE} has no \`excluded\` array. Failing closed.`);
  }
  excluded = new Set(parsed.excluded);
} catch (e) {
  die(`cannot read/parse exclusions ${EXCL_FILE}: ${e.message}. Failing closed.`);
}

// An un-run test: exists, not referenced by CI (file or dir), not on the backlog.
const unrun = testFiles.filter((f) => !isReferenced(f) && !excluded.has(f));
const runCount = testFiles.filter(isReferenced).length;

// Shrink-only: a backlog entry that no longer exists, OR that is now referenced by CI (wired — so it
// must be removed from the backlog). The backlog may only shrink.
const existing = new Set(testFiles);
const staleGone = [...excluded].filter((f) => !existing.has(f));
const staleWired = [...excluded].filter((f) => isReferenced(f));

const problems = [];
for (const f of unrun) problems.push(`NOT run in CI and NOT on the backlog: ${f}`);
for (const f of staleGone) problems.push(`backlog entry no longer exists — prune it (shrink-only): ${f}`);
for (const f of staleWired) problems.push(`backlog entry is now wired into CI — remove it from the backlog (shrink-only): ${f}`);

if (problems.length) {
  console.error(`✖ check-deno-test-coverage: ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `\nEvery supabase/functions/**/*.test.ts must RUN in CI. Add a new test to the \`deno test\` list in\n` +
      `.github/workflows/ci.yml (preferred), or — only for a pre-existing unwired test — it must sit on the\n` +
      `shrink-only backlog scripts/ci/deno-test-exclusions.json. A new test may never be added to the backlog.`
  );
  process.exit(1);
}

console.log(
  `✓ check-deno-test-coverage: OK — ${testFiles.length} edge test files; ` +
    `${runCount} run in CI (explicit files + directory args), ${excluded.size} on the shrink-only backlog, 0 silently un-run.`
);
