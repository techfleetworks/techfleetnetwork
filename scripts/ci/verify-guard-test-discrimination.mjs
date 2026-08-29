#!/usr/bin/env node
/**
 * DISCRIMINATION GATE — mutation-tests every guard's own test.
 *
 * check-guard-has-test proves each guard is EXEC'd by a committed test. That is necessary
 * but not sufficient: a test could exec the guard and assert nothing meaningful (a vacuous
 * test), so a BROKEN guard would still ship a false green. This gate closes that hole
 * mechanically: it replaces every tested guard with a NO-OP (a stub that always exits 0),
 * runs the guard smoke suite once, and requires every guard's test to FAIL. A test that
 * still PASSES when its guard does nothing does not actually assert the guard's behavior —
 * it is vacuous — and CI blocks it. (decisions.md §6, ADR-0023. This is the mechanical form
 * of "prove your gate discriminates" — the live proof that breaking a guard reddens its test.)
 *
 * This is a mutation-testing JOB, not a scanning guard: it MUTATES files (always restoring
 * them in a finally) and runs vitest. It fails closed on any missing input.
 *
 * GUARD_DISCRIMINATE_ROOT overrides the repo root for this job's own demonstration/tests;
 * never set in CI/production.
 */
import { readdirSync, readFileSync, writeFileSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const ROOT = process.env.GUARD_DISCRIMINATE_ROOT
  ? resolve(process.env.GUARD_DISCRIMINATE_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CI_DIR = join(ROOT, "scripts/ci");
const SMOKE_DIR = join(ROOT, "src/test/smoke");
const VITEST = resolve(ROOT, "node_modules/vitest/vitest.mjs");
const NOOP =
  "#!/usr/bin/env node\n// mutant: no-op guard (verify-guard-test-discrimination)\nprocess.exit(0);\n";

const fail = (msg, code = 2) => {
  console.error(`✖ verify-guard-test-discrimination: ${msg}`);
  process.exit(code);
};

// --- Enumerate the TESTED guards (guards NOT on the burn-down allowlist) -------------
let guards;
try {
  guards = readdirSync(CI_DIR).filter(
    (f) => f.endsWith(".mjs") && (f.startsWith("check-") || f === "arch-gate.mjs")
  );
} catch (e) {
  fail(`cannot read ${CI_DIR}: ${e.message}. Failing closed.`);
}
if (!guards.length) fail("discovered 0 guards under scripts/ci — path moved? Failing closed.");

let allowlist;
try {
  const parsed = JSON.parse(readFileSync(join(CI_DIR, "guard-test-allowlist.json"), "utf8"));
  if (!Array.isArray(parsed)) throw new Error("expected a JSON array");
  allowlist = new Set(parsed);
} catch (e) {
  fail(`cannot read guard-test-allowlist.json: ${e.message}. Failing closed.`);
}
const tested = guards.filter((g) => !allowlist.has(g));
if (!tested.length) {
  console.log(
    "✓ verify-guard-test-discrimination: OK — 0 tested guards (all on the burn-down allowlist); nothing to mutate yet."
  );
  process.exit(0);
}

// --- Map each guard-smoke-test file to the tested guard(s) it exercises ---------------
function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const n of entries) {
    const full = join(dir, n);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (n.endsWith(".ts")) out.push(full);
  }
  return out;
}
let smokeFiles;
try {
  statSync(SMOKE_DIR);
  smokeFiles = walk(SMOKE_DIR);
} catch (e) {
  fail(`cannot read ${SMOKE_DIR}: ${e.message}. Failing closed (cannot verify without the tests).`);
}

const GUARD_REF = /scripts\/ci\/([\w-]+\.mjs)/g;
const guardTestFiles = []; // { file, guards: [tested guards it references] }
for (const f of smokeFiles) {
  const src = readFileSync(f, "utf8");
  const refs = [...new Set([...src.matchAll(GUARD_REF)].map((m) => m[1]))].filter((g) =>
    tested.includes(g)
  );
  if (refs.length) guardTestFiles.push({ file: f, guards: refs });
}
// Every tested guard must have at least one test file (check-guard-has-test enforces this);
// if not, our mapping is broken — fail closed rather than silently skip a guard.
const covered = new Set(guardTestFiles.flatMap((t) => t.guards));
const unmapped = tested.filter((g) => !covered.has(g));
if (unmapped.length) {
  fail(
    `could not map a smoke test to ${unmapped.length} tested guard(s): ${unmapped.join(", ")}. ` +
      `Failing closed rather than skipping their discrimination check.`
  );
}

// --- Mutate every tested guard to a no-op, run the guard suite ONCE, restore ----------
const backups = new Map();
let jsonPath;
try {
  for (const g of tested) {
    const p = join(CI_DIR, g);
    backups.set(p, readFileSync(p, "utf8"));
    writeFileSync(p, NOOP);
  }
  const tmp = mkdtempSync(join(tmpdir(), "discriminate-"));
  jsonPath = join(tmp, "result.json");
  try {
    execFileSync(
      process.execPath,
      [
        VITEST,
        "run",
        ...guardTestFiles.map((t) => relative(ROOT, t.file)),
        "--reporter=json",
        "--outputFile",
        jsonPath,
      ],
      { cwd: ROOT, stdio: "pipe", env: { ...process.env, NO_COLOR: "1" } }
    );
  } catch {
    /* vitest exits non-zero because most guard tests SHOULD fail against no-op guards — expected. */
  }
} finally {
  for (const [p, content] of backups) writeFileSync(p, content); // ALWAYS restore the real guards
}

// --- Read per-file results: a guard test that PASSED against no-op guards is VACUOUS ---
let report;
try {
  report = JSON.parse(readFileSync(jsonPath, "utf8"));
} catch (e) {
  fail(`could not read vitest json report: ${e.message}. Failing closed (guards were restored).`);
}
const passedFiles = new Set(
  (report.testResults || [])
    .filter((r) => r.status === "passed")
    .map((r) => resolve(r.name).replace(/\\/g, "/"))
);
const vacuous = guardTestFiles.filter((t) => passedFiles.has(resolve(t.file).replace(/\\/g, "/")));

if (vacuous.length) {
  console.error(
    `✖ verify-guard-test-discrimination: ${vacuous.length} VACUOUS guard test(s) — they PASS even when their guard is a no-op, so a broken guard would ship a false green:`
  );
  for (const t of vacuous)
    console.error(`  - ${relative(ROOT, t.file)}  (guards: ${t.guards.join(", ")})`);
  console.error(
    "  Fix: add a scenario asserting a NON-zero exit tied to the guard's behavior (a real violation -> 1, or fail-closed -> 2) so the test fails when the guard stops detecting."
  );
  process.exit(1);
}

console.log(
  `✓ verify-guard-test-discrimination: OK — ${guardTestFiles.length} guard test(s) covering ${tested.length} tested guard(s); each FAILS when its guard is a no-op (all genuinely discriminate).`
);
