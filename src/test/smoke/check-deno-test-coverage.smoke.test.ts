// Smoke coverage for scripts/ci/check-deno-test-coverage.mjs — DENO-TEST-COVERAGE-001.
// The guard makes an un-run edge-function test impossible to add silently (re-audit TST-2; ADR
// 20261110-deno-test-coverage): every supabase/functions/**/*.test.ts must be referenced by the ci.yml
// `deno test` run, or sit on the shrink-only backlog scripts/ci/deno-test-exclusions.json. Each scenario
// builds a throwaway functions tree + ci.yml + exclusions under the DENO_COV_* seams and asserts exit
// codes: referenced->0, unrun+unlisted->1, backlogged->0, stale(gone)->1, stale(now wired)->1, zero
// tests->2, missing ci.yml->2, DIRECTORY-arg coverage->0, mention-outside-deno-test->1, malformed
// backlog->2. FAILS if the guard stops detecting (discrimination, decisions §6).
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-deno-test-coverage.mjs");

afterAll(cleanupGuardFixtures);

/**
 * Build a fixture. `tests` = test file relpaths (under supabase/functions) to create; `ci` = the ci.yml
 * body; `excluded` = the backlog array. `omitCi` skips writing ci.yml (fail-closed path). Returns exit.
 */
function run(
  tests: string[],
  ci: string,
  excluded: string[] = [],
  omitCi = false
): number {
  const root = guardFixture({});
  const fnDir = resolve(root, "supabase", "functions");
  mkdirSync(fnDir, { recursive: true });
  for (const t of tests) {
    const abs = resolve(root, t);
    mkdirSync(resolve(abs, ".."), { recursive: true });
    writeFileSync(abs, "// test\n");
  }
  const ciFile = resolve(root, "ci.yml");
  if (!omitCi) writeFileSync(ciFile, ci);
  const exclFile = resolve(root, "excl.json");
  writeFileSync(exclFile, JSON.stringify({ excluded }));
  try {
    execFileSync("node", [GUARD], {
      stdio: "pipe",
      env: {
        ...process.env,
        DENO_COV_FUNCTIONS_DIR: fnDir,
        DENO_COV_CI_FILE: ciFile,
        DENO_COV_EXCL: exclFile,
      },
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const A = "supabase/functions/foo/a.test.ts";
const RUN_A = `deno test ${A}\n`;

describe("check-deno-test-coverage guard (smoke)", () => {
  it("DTC-001: passes (0) when the test is referenced by the ci.yml deno run", () => {
    expect(run([A], RUN_A)).toBe(0);
  });

  it("DTC-002: FLAGS (1) a test that is neither run in CI nor on the backlog", () => {
    expect(run([A], "deno test\n")).toBe(1);
  });

  it("DTC-003: ALLOWS (0) an un-run test that sits on the shrink-only backlog", () => {
    expect(run([A], "deno test\n", [A])).toBe(0);
  });

  it("DTC-004: FLAGS (1) a backlog entry whose file no longer exists (shrink-only prune)", () => {
    expect(run([A], RUN_A, ["supabase/functions/foo/gone.test.ts"])).toBe(1);
  });

  it("DTC-005: FLAGS (1) a backlog entry that is now wired into CI (must be removed — shrink-only)", () => {
    expect(run([A], RUN_A, [A])).toBe(1);
  });

  it("DTC-006: fails CLOSED (2) when there are no test files", () => {
    expect(run([], RUN_A)).toBe(2);
  });

  it("DTC-007: fails CLOSED (2) when ci.yml is missing", () => {
    expect(run([A], RUN_A, [], true)).toBe(2);
  });

  it("DTC-008: passes (0) when the test is covered by a DIRECTORY arg of `deno test`", () => {
    // `deno test supabase/functions/foo/` runs every *.test.ts under foo/ — a.test.ts is run.
    expect(run([A], "deno test \\\n  supabase/functions/foo/\n")).toBe(0);
  });

  it("DTC-009: FLAGS (1) a path mentioned OUTSIDE the `deno test` command (comment / paths filter / deno check)", () => {
    // Only `deno test` runs tests; a mention in a comment, a paths: filter, or the typecheck-only
    // `deno check` step must NOT count as run (else an un-run test reads as covered — false green).
    const ci =
      `# note: ${A}\n` +
      `on:\n  pull_request:\n    paths:\n      - ${A}\n` +
      `jobs:\n  deno-check:\n    steps:\n      - run: deno check ${A}\n`;
    expect(run([A], ci)).toBe(1);
  });

  it("DTC-010: fails CLOSED (2) when the backlog JSON is malformed / has no `excluded` array", () => {
    const root = guardFixture({});
    const fnDir = resolve(root, "supabase", "functions", "foo");
    mkdirSync(fnDir, { recursive: true });
    writeFileSync(resolve(fnDir, "a.test.ts"), "// test\n");
    const ciFile = resolve(root, "ci.yml");
    writeFileSync(ciFile, RUN_A);
    const exclFile = resolve(root, "excl.json");
    writeFileSync(exclFile, "{ this is not json");
    let code: number;
    try {
      execFileSync("node", [GUARD], {
        stdio: "pipe",
        env: {
          ...process.env,
          DENO_COV_FUNCTIONS_DIR: resolve(root, "supabase", "functions"),
          DENO_COV_CI_FILE: ciFile,
          DENO_COV_EXCL: exclFile,
        },
      });
      code = 0;
    } catch (e) {
      code = (e as { status?: number }).status ?? 1;
    }
    expect(code).toBe(2);
  });
});
