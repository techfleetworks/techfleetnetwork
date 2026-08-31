#!/usr/bin/env node
/**
 * DROPPED-SUPABASE-ERROR-BUDGET-001 — the dropped-error grandfather budget may only SHRINK.
 *
 * WHY THIS EXISTS
 * ---------------
 * `no-dropped-supabase-error` is `error`, with a per-file grandfather budget in
 * scripts/lint/dropped-supabase-error-grandfather.json (a file may keep up to N pre-existing
 * `const { data } = await supabase…` sites that drop `error`; anything above N, or any such
 * site in an unbudgeted file, is a lint error). That makes a NEW dropped error impossible —
 * UNLESS a dev simply raises a number in the budget. This guard removes that escape: the
 * budget may only shrink. A new key (a previously-clean file gaining budget) or any increased
 * count vs `main` fails CI. So for ANY developer: dropping a supabase error is a lint error,
 * and raising the budget to allow it errors here — both paths blocked. The audit's #1
 * error-handling class is therefore un-regressable, not merely discouraged (ADR-0032). The
 * existing sites burn down (never grow) as they are fixed to `{ data, error }` + handling.
 *
 * Fail-closed: unreadable current budget → exit 2. No baseline on main (the PR that first
 * introduces the file) → pass with a notice (this establishes the baseline). A CI checkout
 * without fetch-depth: 0 (base ref unresolvable) → exit 2, never a silent pass.
 *
 * Test-only seams (never set in CI/prod): DROPPED_SUPABASE_ERROR_BUDGET_CURRENT /
 * DROPPED_SUPABASE_ERROR_BUDGET_BASE point at fixture files; DROPPED_SUPABASE_ERROR_BUDGET_NO_REF
 * / DROPPED_SUPABASE_ERROR_BUDGET_INTRODUCTION exercise the two git-dependent branches.
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REL = "scripts/lint/dropped-supabase-error-grandfather.json";
const CURRENT_PATH = process.env.DROPPED_SUPABASE_ERROR_BUDGET_CURRENT || resolve(ROOT, REL);

const die = (msg) => {
  console.error(`✖ check-dropped-supabase-error-budget-shrinks: ${msg}`);
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
 * The committed baseline, as a discriminated result so a genuine FIRST-INTRODUCTION (base ref
 * exists, budget file not in it → allowed) is told apart from a misconfigured CI checkout
 * (base ref not fetched → MUST fail closed, never pass) — the fail-open ADR-0030 hardened against.
 */
function resolveBase() {
  if (process.env.DROPPED_SUPABASE_ERROR_BUDGET_BASE) {
    return {
      kind: "compare",
      base: JSON.parse(readFileSync(process.env.DROPPED_SUPABASE_ERROR_BUDGET_BASE, "utf8")),
    };
  }
  if (process.env.DROPPED_SUPABASE_ERROR_BUDGET_NO_REF === "1") return { kind: "no-ref" };
  if (process.env.DROPPED_SUPABASE_ERROR_BUDGET_INTRODUCTION === "1")
    return { kind: "introduction" };

  const refExists = (r) => {
    try {
      execFileSync("git", ["rev-parse", "--verify", "--quiet", r], { cwd: ROOT, stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  };
  const ref = ["origin/main", "main"].find(refExists);
  if (!ref) return { kind: "no-ref" };
  try {
    const txt = execFileSync("git", ["show", `${ref}:${REL}`], { cwd: ROOT, encoding: "utf8" });
    return { kind: "compare", base: JSON.parse(txt) };
  } catch {
    return { kind: "introduction" };
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
    "::notice::[dropped-supabase-error-budget] base branch has no budget file yet — treating this " +
      "as the introducing change. Shrink-only is enforced from the next change onward."
  );
  process.exit(0);
}
const base = resolved.base;

const violations = [];
for (const [file, count] of Object.entries(current)) {
  if (!(file in base)) {
    violations.push(
      `${file}: new entry (+${count}) — a previously-clean file cannot gain a dropped-error budget; take { data, error } and handle error`
    );
  } else if (count > base[file]) {
    violations.push(
      `${file}: budget raised ${base[file]} → ${count} — the budget may only shrink; handle the error instead`
    );
  }
}

const currentTotal = Object.values(current).reduce((a, b) => a + b, 0);
const baseTotal = Object.values(base).reduce((a, b) => a + b, 0);

if (violations.length) {
  console.error(
    `✖ check-dropped-supabase-error-budget-shrinks: the dropped-error grandfather budget must only SHRINK (ADR-0032):`
  );
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log(
  `✓ check-dropped-supabase-error-budget-shrinks: OK — budget did not grow ` +
    `(${Object.keys(current).length} files, ${currentTotal} dropped-error sites; baseline was ${baseTotal}).`
);
process.exit(0);
