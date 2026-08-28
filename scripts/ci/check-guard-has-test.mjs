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
 * A guard `check-foo.mjs` counts as tested iff some committed test file — a `*.test.ts`
 * under `src/test/`, or a co-located `*.test.ts` under `supabase/functions/` — actually
 * RUNS it: the guard's path is passed to a subprocess exec (execFileSync / execSync /
 * spawnSync / spawn / fork), directly or via a resolved `const X = resolve(...)` binding.
 * This is decided by PARSING each test with the TypeScript compiler API, not by string
 * matching — so a comment, an unrelated string, or a mention of guard B inside a file that
 * only execs guard A never counts (no false green, and no cross-credit).
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
import ts from "typescript";

// Cross-platform repo root = this guard's own location (cwd-independent).
// `new URL(".", import.meta.url).pathname` returns "/C:/…" on Windows, which resolve()
// doubles into "C:\\C:\\…" — use fileURLToPath (decisions.md §6).
// GUARD_HAS_TEST_ROOT overrides the root ONLY for this guard's own smoke test, which points
// it at throwaway fixture repos; it is never set in CI/production, so the shipped behavior is
// always the fileURLToPath location. (Running the real guard against fixtures — rather than a
// copy — keeps the TypeScript dependency resolvable and tests the actual shipped code.)
const ROOT = process.env.GUARD_HAS_TEST_ROOT
  ? resolve(process.env.GUARD_HAS_TEST_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "../..");
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

// Decide coverage PRECISELY: parse each candidate test file with the TypeScript compiler
// API and collect the guard files it PASSES TO AN EXEC — resolving `const X = resolve(...)`
// bindings so a variable-referenced guard path is followed. A guard is credited only if a
// test actually runs it; a comment, an unrelated string literal, or a mention of guard B in
// a file that only execs guard A is never counted (root-cause fix for the per-blob
// cross-credit weakness judge-arch flagged on PR #310 — the meta-guard must guard itself).
const EXEC_NAMES = new Set([
  "execFileSync",
  "execSync",
  "spawnSync",
  "spawn",
  "exec",
  "execFile",
  "fork",
]);
const EXEC_HINT = /\b(execFileSync|execSync|spawnSync|spawn|exec|execFile|fork)\b/;

// NOTE: ts.forEachChild STOPS at the first child whose callback returns a truthy value,
// so these callbacks must return undefined (block body) to visit EVERY child.
const stringsIn = (node, out) => {
  if (ts.isStringLiteralLike(node)) out.push(node.text);
  node.forEachChild((c) => {
    stringsIn(c, out);
  });
  return out;
};
const identsIn = (node, out) => {
  if (ts.isIdentifier(node)) out.push(node.text);
  node.forEachChild((c) => {
    identsIn(c, out);
  });
  return out;
};
const calleeName = (expr) =>
  ts.isIdentifier(expr) ? expr.text : ts.isPropertyAccessExpression(expr) ? expr.name.text : null;

/** Guard-file path strings actually passed to a subprocess exec in `text` (const-resolved). */
function guardStringsExecutedBy(text) {
  let sf;
  try {
    sf = ts.createSourceFile("t.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  } catch {
    return []; // an unparseable test file cannot vouch for any guard — credit nothing
  }
  // Pass 1: const bindings -> the string literals in their initializer (e.g.
  // `const GUARD = resolve(REPO, "scripts/ci/check-foo.mjs")`).
  const bindings = new Map();
  const pass1 = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const strs = stringsIn(node.initializer, []);
      if (strs.length) {
        bindings.set(node.name.text, (bindings.get(node.name.text) || []).concat(strs));
      }
    }
    node.forEachChild(pass1);
  };
  pass1(sf);
  // Pass 2: exec call arguments -> strings (direct literals + via a resolved const ident).
  const executed = [];
  const pass2 = (node) => {
    if (ts.isCallExpression(node) && EXEC_NAMES.has(calleeName(node.expression))) {
      for (const arg of node.arguments) {
        executed.push(...stringsIn(arg, []));
        for (const id of identsIn(arg, [])) {
          const bound = bindings.get(id);
          if (bound) executed.push(...bound);
        }
      }
    }
    node.forEachChild(pass2);
  };
  pass2(sf);
  return executed;
}

const testedSet = new Set();
for (const text of testBlobs) {
  if (!EXEC_HINT.test(text)) continue; // no subprocess exec -> cannot exercise any guard
  const executed = guardStringsExecutedBy(text);
  if (executed.length === 0) continue;
  for (const g of guards) {
    // A path like "scripts/ci/check-foo.mjs" (or a bare "check-foo.mjs") that reaches an
    // exec. The trailing ".mjs" anchors the match, so no guard is a prefix of another.
    if (executed.some((s) => s.includes(g))) testedSet.add(g);
  }
}
const references = (guard) => testedSet.has(guard);

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
    "Add a committed test that runs the guard — model it on src/test/smoke/check-guard-has-test.smoke.test.ts (execFileSync the guard against throwaway fixtures, assert its exit codes).",
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
