// Smoke coverage for scripts/ci/check-raw-invoke-budget-shrinks.mjs — RAW-INVOKE-BUDGET-001.
// The raw-invoke grandfather budget (scripts/lint/raw-invoke-grandfather.json) may only SHRINK: this
// is what stops a dev from raising a number to sneak in a new raw supabase.functions.invoke after the
// lint rule flipped to error. Together, ESLint (blocks new invokes) + this guard (blocks raising the
// budget) make error-shape coupling structurally impossible for any developer (ADR-0028).
//
// The guard reads the current budget and the `git show main:` baseline; test-only seams point both at
// fixtures instead.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-raw-invoke-budget-shrinks.mjs");

afterAll(cleanupGuardFixtures);

/** Run the guard with current+base budget fixtures; return exit code (0 ok, 1 grew, 2 fail-closed). */
function run(current: Record<string, number> | null, base: Record<string, number>): number {
  const root = guardFixture({ "readme.md": "x" });
  const env: Record<string, string> = {
    ...process.env,
    RAW_INVOKE_BUDGET_BASE: writeJson(root, "base.json", base),
  };
  if (current !== null) env.RAW_INVOKE_BUDGET_CURRENT = writeJson(root, "current.json", current);
  else env.RAW_INVOKE_BUDGET_CURRENT = resolve(root, "does-not-exist.json");
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
    RAW_INVOKE_BUDGET_CURRENT: writeJson(root, "current.json", { "a.ts": 1 }),
    ...extra,
  };
  delete env.RAW_INVOKE_BUDGET_BASE; // exercise the git-path seams, not the compare seam
  try {
    execFileSync("node", [GUARD], { stdio: "pipe", env });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("check-raw-invoke-budget-shrinks guard (smoke)", () => {
  it("RIB-001: passes when the budget shrinks (count lowered + file removed)", () => {
    expect(run({ "a.ts": 1 }, { "a.ts": 2, "b.ts": 1 })).toBe(0);
  });

  it("RIB-002: FLAGS (exit 1) when a file's budget is RAISED", () => {
    expect(run({ "a.ts": 2 }, { "a.ts": 1 })).toBe(1);
  });

  it("RIB-003: FLAGS (exit 1) when a previously-clean file gains a new budget entry", () => {
    expect(run({ "a.ts": 1, "b.ts": 1 }, { "a.ts": 1 })).toBe(1);
  });

  it("RIB-004: passes when the budget holds equal", () => {
    expect(run({ "a.ts": 2 }, { "a.ts": 2 })).toBe(0);
  });

  it("RIB-005: fails CLOSED (exit 2) when the current budget file is missing", () => {
    expect(run(null, { "a.ts": 1 })).toBe(2);
  });

  it("RIB-006: fails CLOSED (exit 2) when the base ref can't be resolved (CI not fetched)", () => {
    // The real fail-open bug: no baseline ref must NOT be treated as an introduction.
    expect(runEnv({ RAW_INVOKE_BUDGET_NO_REF: "1" })).toBe(2);
  });

  it("RIB-007: passes (exit 0) as the introducing change when the base ref lacks the budget file", () => {
    expect(runEnv({ RAW_INVOKE_BUDGET_INTRODUCTION: "1" })).toBe(0);
  });
});
