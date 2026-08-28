#!/usr/bin/env node
/**
 * GATE-INTEGRITY companion — every guard in scripts/ci/ must have a COMMITTED test.
 *
 * A guard proven only by an ephemeral fixture (or never proven) can silently rot: a
 * regression to the guard's own logic — a broken regex, a fail-open, an inverted
 * condition — then ships GREEN because nothing exercises it. decisions.md §6 says a
 * check must fail closed and never pass falsely; this closes the remaining hole by
 * requiring each guard to be pinned by a committed, CI-run test.
 *
 * A guard `check-foo.mjs` counts as tested iff some committed test file — a
 * `*.test.ts` under `src/test/`, or a co-located `*.test.ts` under
 * `supabase/functions/` — names its filename in NON-COMMENT code AND invokes a guard
 * as a subprocess (execFileSync / execSync / spawnSync / spawn). A bare mention (a
 * comment, a coverage-map note, an unrelated string) does NOT count — that would let a
 * guard pass with a one-line comment and never actually be exercised (false green).
 *
 * RATCHET: ALLOWLIST holds guards that predate this rule and have no test yet (known
 * debt). It may only SHRINK: a guard that GAINS a test must be removed from it (the
 * guard flags that), and a NEW guard may not be added to it. Fails closed — a missing
 * dir, an unreadable file, or zero guards discovered exits non-zero, never a silent 0.
 *
 * This guard is itself a bespoke directory reader (it enumerates guards and
 * cross-references the test tree — not a single-root content scan), so it is a named
 * exception in check-ci-guard-integrity.mjs's BESPOKE_DIR_READERS. It is pinned by
 * src/test/smoke/check-guard-has-test.smoke.test.ts (it obeys its own rule).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Cross-platform repo root. `new URL(".", import.meta.url).pathname` returns "/C:/…"
// on Windows, which resolve() doubles into "C:\\C:\\…" — use fileURLToPath (decisions.md §6).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CI_DIR = join(ROOT, "scripts/ci");

// Guards that predate this rule and have no committed test yet — the burn-down debt.
// SHRINK ONLY: never add a name to silence the gate for new code; remove a name when it
// gains a test. Externalized to JSON (not an in-code Set) so this guard's OWN smoke test
// can drive fixtures with a controlled allowlist WITHOUT naming a real guard in its source
// — a source mention of a real guard filename would otherwise be miscounted as coverage.
const ALLOWLIST_FILE = join(CI_DIR, "guard-test-allowlist.json");
let ALLOWLIST;
try {
  const parsed = JSON.parse(readFileSync(ALLOWLIST_FILE, "utf8"));
  if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
    throw new Error("expected a JSON array of guard filenames");
  }
  ALLOWLIST = new Set(parsed);
} catch (e) {
  console.error(
    `✖ check-guard-has-test: cannot read allowlist ${ALLOWLIST_FILE}: ${e.message}. Failing closed.`
  );
  process.exit(2);
}

/** Recursively collect files under `dir` whose basename passes `match`. Missing dir → []. */
function collect(dir, match, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // optional root (e.g. supabase/functions may be absent) — caller decides
  }
  for (const name of entries) {
    const full = join(dir, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      if (name === "node_modules" || name === "dist" || name === "coverage") continue;
      collect(full, match, out);
    } else if (match(name)) {
      out.push(full);
    }
  }
  return out;
}

// --- Enumerate the guards (same predicate as the meta-guard) — fail closed ----------
let guards;
try {
  guards = readdirSync(CI_DIR).filter(
    (f) => f.endsWith(".mjs") && (f.startsWith("check-") || f === "arch-gate.mjs")
  );
} catch (e) {
  console.error(`✖ check-guard-has-test: cannot read ${CI_DIR}: ${e.message}. Failing closed.`);
  process.exit(2);
}
if (guards.length === 0) {
  console.error(
    `✖ check-guard-has-test: discovered 0 guards under scripts/ci — path moved? Failing closed rather than passing vacuously.`
  );
  process.exit(2);
}

// --- Gather committed test files. src/test MUST exist (fail closed if not) ----------
const srcTestDir = join(ROOT, "src/test");
let srcTests;
try {
  statSync(srcTestDir);
  srcTests = collect(srcTestDir, (n) => n.endsWith(".ts"));
} catch (e) {
  console.error(
    `✖ check-guard-has-test: cannot read ${srcTestDir}: ${e.message}. Failing closed (cannot verify coverage without the test tree).`
  );
  process.exit(2);
}
const denoTests = collect(join(ROOT, "supabase/functions"), (n) => n.endsWith(".test.ts"));

const testBlobs = [];
for (const f of [...srcTests, ...denoTests]) {
  try {
    testBlobs.push(readFileSync(f, "utf8"));
  } catch (e) {
    console.error(
      `✖ check-guard-has-test: cannot read test file ${f}: ${e.message}. Failing closed.`
    );
    process.exit(2);
  }
}

// Strip block + line comments so a guard named only in a comment (or a bdd-gate
// coverage-map note) is NOT miscounted as coverage. `[^:]` keeps `https://` intact.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
// A real guard test runs the guard as a subprocess; these primitives mark that.
const EXEC_RE = /\bexecFileSync\b|\bexecSync\b|\bspawnSync\b|\bspawn\s*\(/;
const codeBlobs = testBlobs.map(stripComments);

// Tested iff the guard filename appears in a test's NON-COMMENT code AND that same file
// invokes a guard subprocess — so a bare comment/string mention can't fake coverage.
// Known, reviewed granularity: the two conditions are checked per-file, not tied to the
// same exec call. A file that execs guard A while also code-naming guard B (without
// running B) would credit B. We accept this because the real guard tests exec via a
// `const GUARD = resolve(...)` variable, not the literal filename, so a stricter
// "filename-inside-the-exec-call" check would false-NEGATIVE every real test. The honest
// testedCount (printed on success) makes any accidental cross-credit visible in review;
// it is 0 today (one guard per exec-ing test file).
const references = (guard) => codeBlobs.some((c) => c.includes(guard) && EXEC_RE.test(c));

// --- Apply the ratchet --------------------------------------------------------------
const untestedNew = []; // not tested, not allowlisted → must add a test
const staleAllow = []; // tested but still on allowlist → must remove from allowlist
let testedCount = 0;
let debtCount = 0;

for (const g of guards) {
  const tested = references(g);
  const onAllow = ALLOWLIST.has(g);
  if (tested) {
    testedCount++;
    if (onAllow) staleAllow.push(g);
  } else if (onAllow) {
    debtCount++;
  } else {
    untestedNew.push(g);
  }
}

const problems = [];
if (untestedNew.length)
  problems.push([
    "guard has NO committed test (a guard proven only ephemerally can rot to a false green):",
    untestedNew,
    "Add a committed test that references the guard filename — model it on src/test/smoke/check-guard-has-test.smoke.test.ts (run the guard against throwaway fixtures, assert its exit codes).",
  ]);
if (staleAllow.length)
  problems.push([
    "guard now HAS a test but is still on the ALLOWLIST (the ratchet must shrink):",
    staleAllow,
    "Remove these names from scripts/ci/guard-test-allowlist.json (the shrink-only allowlist).",
  ]);

if (problems.length) {
  console.error(
    `✖ check-guard-has-test: ${untestedNew.length + staleAllow.length} violation(s) across ${guards.length} guards ` +
      `(${testedCount} tested, ${debtCount} known-debt):`
  );
  for (const [title, items, fix] of problems) {
    console.error(`\n  ${title}`);
    for (const it of items) console.error(`    - ${it}`);
    console.error(`  Fix: ${fix}`);
  }
  process.exit(1);
}

console.log(
  `✓ check-guard-has-test: OK — ${guards.length} guards scanned, ${testedCount} have a committed test, ` +
    `${debtCount} known-debt on the shrink-only allowlist, 0 new untested guards.`
);
