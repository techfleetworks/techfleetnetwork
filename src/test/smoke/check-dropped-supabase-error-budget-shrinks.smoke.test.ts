// Smoke coverage for scripts/ci/check-dropped-supabase-error-budget-shrinks.mjs — DROPPED-SUPABASE-ERROR-BUDGET-001 (ADR-0032).
// The dropped-error grandfather budget (scripts/lint/dropped-supabase-error-grandfather.json) may only
// SHRINK: with the ESLint rule `no-dropped-supabase-error` at error, this guard is what stops a dev
// raising a number to sneak past it. Together they make the audit's #1 error-handling class
// (destructure `data`, drop `error`) structurally un-regressable.
//
// The guard reads the current budget and the `git show main:` baseline; test-only seams point both at
// fixtures instead.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-dropped-supabase-error-budget-shrinks.mjs");

afterAll(cleanupGuardFixtures);

/** Run with current+base budget fixtures; return exit code (0 ok, 1 grew, 2 fail-closed). */
function run(current: Record<string, number> | null, base: Record<string, number>): number {
  const root = guardFixture({ "readme.md": "x" });
  const env: Record<string, string> = {
    ...process.env,
    DROPPED_SUPABASE_ERROR_BUDGET_BASE: writeJson(root, "base.json", base),
  };
  if (current !== null)
    env.DROPPED_SUPABASE_ERROR_BUDGET_CURRENT = writeJson(root, "current.json", current);
  else env.DROPPED_SUPABASE_ERROR_BUDGET_CURRENT = resolve(root, "does-not-exist.json");
  try {
    execFileSync("node", [GUARD], { stdio: "pipe", env });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}
function writeJson(root: string, name: string, obj: unknown): string {
  const p = resolve(root, name);
  writeFileSync(p, JSON.stringify(obj));
  return p;
}

/** Run with an explicit env (for the git-path seams); a current budget is always provided. */
function runEnv(extra: Record<string, string>): number {
  const root = guardFixture({ "readme.md": "x" });
  const env: Record<string, string> = {
    ...process.env,
    DROPPED_SUPABASE_ERROR_BUDGET_CURRENT: writeJson(root, "current.json", {
      "src/services/a.ts": 1,
    }),
    ...extra,
  };
  delete env.DROPPED_SUPABASE_ERROR_BUDGET_BASE; // exercise the git-path seams, not the compare seam
  try {
    execFileSync("node", [GUARD], { stdio: "pipe", env });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("check-dropped-supabase-error-budget-shrinks guard (smoke)", () => {
  it("DSE-001: passes when the budget shrinks (count lowered + file removed)", () => {
    expect(run({ "src/services/a.ts": 1 }, { "src/services/a.ts": 2, "src/hooks/b.ts": 1 })).toBe(
      0
    );
  });

  it("DSE-002: FLAGS (exit 1) when a file's budget is RAISED", () => {
    expect(run({ "src/services/a.ts": 2 }, { "src/services/a.ts": 1 })).toBe(1);
  });

  it("DSE-003: FLAGS (exit 1) when a previously-clean file gains a new budget entry", () => {
    expect(run({ "src/services/a.ts": 1, "src/hooks/b.ts": 1 }, { "src/services/a.ts": 1 })).toBe(
      1
    );
  });

  it("DSE-004: passes when the budget holds equal", () => {
    expect(run({ "src/services/a.ts": 2 }, { "src/services/a.ts": 2 })).toBe(0);
  });

  it("DSE-005: fails CLOSED (exit 2) when the current budget file is missing", () => {
    expect(run(null, { "src/services/a.ts": 1 })).toBe(2);
  });

  it("DSE-006: fails CLOSED (exit 2) when the base ref can't be resolved (CI not fetched)", () => {
    expect(runEnv({ DROPPED_SUPABASE_ERROR_BUDGET_NO_REF: "1" })).toBe(2);
  });

  it("DSE-007: passes (exit 0) as the introducing change when the base ref lacks the budget file", () => {
    expect(runEnv({ DROPPED_SUPABASE_ERROR_BUDGET_INTRODUCTION: "1" })).toBe(0);
  });
});
