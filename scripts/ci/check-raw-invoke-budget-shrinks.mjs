#!/usr/bin/env node
/**
 * RAW-INVOKE-BUDGET-001 — the raw-invoke grandfather budget may only SHRINK.
 *
 * WHY THIS EXISTS
 * ---------------
 * `no-raw-functions-invoke` is `error`, with a per-file grandfather budget in
 * scripts/lint/raw-invoke-grandfather.json (a file may keep up to N pre-existing raw
 * `supabase.functions.invoke` calls; anything above N, or any invoke in an unbudgeted
 * file, is a lint error). That makes a NEW raw invoke impossible — UNLESS a dev simply
 * raises a number in the budget. This guard removes that escape: the budget may only
 * shrink. A new key (a previously-clean file gaining budget) or any increased count vs
 * `main` fails CI. So for ANY developer: adding a raw invoke errors in ESLint, and
 * raising the budget to allow it errors here — both paths blocked. Error-shape coupling
 * (ADR-0028) is therefore structurally impossible, not merely discouraged. Phase 1 burns
 * the budget to zero.
 *
 * Fail-closed: unreadable current budget → exit 2. No baseline on main (the PR that first
 * introduces the file) → pass with a notice (this establishes the baseline).
 *
 * Test-only seams (never set in CI/prod): RAW_INVOKE_BUDGET_CURRENT / RAW_INVOKE_BUDGET_BASE
 * point at fixture files instead of the real budget / the `git show main:` baseline.
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REL = "scripts/lint/raw-invoke-grandfather.json";
const CURRENT_PATH = process.env.RAW_INVOKE_BUDGET_CURRENT || resolve(ROOT, REL);

const die = (msg) => {
  console.error(`✖ check-raw-invoke-budget-shrinks: ${msg}`);
  process.exit(2);
};

if (!existsSync(CURRENT_PATH)) die(`budget file not found at ${CURRENT_PATH}. Failing closed.`);
let current;
try {
  current = JSON.parse(readFileSync(CURRENT_PATH, "utf8"));
} catch (e) {
  die(`current budget is not valid JSON (${e.message}).`);
}

/**
 * The committed baseline, as a discriminated result so the caller can tell a genuine
 * FIRST-INTRODUCTION (base ref exists, budget file not in it → allowed) apart from a
 * misconfigured CI checkout (base ref not fetched → MUST fail closed, never pass). The
 * latter was a real fail-open: gate-verify without fetch-depth: 0 made every PR look like
 * an "introduction," so the shrink guard was inert.
 */
function resolveBase() {
  if (process.env.RAW_INVOKE_BUDGET_BASE) {
    return {
      kind: "compare",
      base: JSON.parse(readFileSync(process.env.RAW_INVOKE_BUDGET_BASE, "utf8")),
    };
  }
  // Test-only seams for the two git-dependent branches (never set in CI/prod):
  if (process.env.RAW_INVOKE_BUDGET_NO_REF === "1") return { kind: "no-ref" };
  if (process.env.RAW_INVOKE_BUDGET_INTRODUCTION === "1") return { kind: "introduction" };

  const refExists = (r) => {
    try {
      execFileSync("git", ["rev-parse", "--verify", "--quiet", r], { cwd: ROOT, stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  };
  const ref = ["origin/main", "main"].find(refExists);
  if (!ref) return { kind: "no-ref" }; // base branch not fetched → cannot verify
  try {
    const txt = execFileSync("git", ["show", `${ref}:${REL}`], { cwd: ROOT, encoding: "utf8" });
    return { kind: "compare", base: JSON.parse(txt) };
  } catch {
    return { kind: "introduction" }; // ref exists but the budget file isn't in it yet
  }
}

const resolved = resolveBase();
if (resolved.kind === "no-ref") {
  die(
    "cannot resolve the base branch (origin/main) to diff the budget — CI must checkout with " +
      "fetch-depth: 0. Failing closed rather than passing without a baseline."
  );
}
if (resolved.kind === "introduction") {
  console.log(
    "::notice::[raw-invoke-budget] base branch has no budget file yet — treating this as the " +
      "introducing change. Shrink-only is enforced from the next change onward."
  );
  process.exit(0);
}
const base = resolved.base;

const violations = [];
for (const [file, count] of Object.entries(current)) {
  if (!(file in base)) {
    violations.push(
      `${file}: new entry (+${count}) — a previously-clean file cannot gain a raw-invoke budget; use invokeEdge`
    );
  } else if (count > base[file]) {
    violations.push(
      `${file}: budget raised ${base[file]} → ${count} — the budget may only shrink; migrate to invokeEdge instead`
    );
  }
}

const currentTotal = Object.values(current).reduce((a, b) => a + b, 0);
const baseTotal = Object.values(base).reduce((a, b) => a + b, 0);

if (violations.length) {
  console.error(
    `✖ check-raw-invoke-budget-shrinks: the raw-invoke grandfather budget must only SHRINK (ADR-0028):`
  );
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log(
  `✓ check-raw-invoke-budget-shrinks: OK — budget did not grow ` +
    `(${Object.keys(current).length} files, ${currentTotal} invokes; baseline was ${baseTotal}).`
);
process.exit(0);
