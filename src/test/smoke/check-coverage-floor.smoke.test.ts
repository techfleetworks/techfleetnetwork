// Smoke coverage for scripts/ci/check-coverage-floor.mjs — COVERAGE-FLOOR-001.
// The guard enforces that measured coverage (coverage/coverage-summary.json) stays at or above a
// shrink-only floor (coverage-floor.json), and fails CLOSED when the summary is missing/garbage so
// "coverage never ran" can't read as a pass (enterprise-readiness audit 2026-10 H2; decisions.md §6).
// Each scenario writes a throwaway summary + floor and points the guard at them via the
// COVERAGE_SUMMARY / COVERAGE_FLOOR seams, asserting exit codes: at/above→0, below→1, missing/garbage
// summary→2. FAILS if the guard stops detecting (discrimination, decisions §6).
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-coverage-floor.mjs");

afterAll(cleanupGuardFixtures);

const summaryOf = (pct: number) => ({
  total: {
    lines: { total: 100, covered: pct, skipped: 0, pct },
    statements: { total: 100, covered: pct, skipped: 0, pct },
    functions: { total: 100, covered: pct, skipped: 0, pct },
    branches: { total: 100, covered: pct, skipped: 0, pct },
  },
});

/** Run the guard with a given summary (object | null | raw string) and floor map. Returns exit code. */
function run(summary: object | string | null, floor: Record<string, number>): number {
  const root = guardFixture({});
  const floorPath = resolve(root, "floor.json");
  writeFileSync(floorPath, JSON.stringify(floor));
  let summaryPath = resolve(root, "missing-summary.json");
  if (summary !== null) {
    summaryPath = resolve(root, "coverage-summary.json");
    writeFileSync(summaryPath, typeof summary === "string" ? summary : JSON.stringify(summary));
  }
  try {
    execFileSync("node", [GUARD], {
      stdio: "pipe",
      env: { ...process.env, COVERAGE_SUMMARY: summaryPath, COVERAGE_FLOOR: floorPath },
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const FLOOR = { lines: 80, statements: 80, functions: 75, branches: 70 };

describe("check-coverage-floor guard (smoke)", () => {
  it("COV-001: passes (0) when every metric is at or above the floor", () => {
    expect(run(summaryOf(85), FLOOR)).toBe(0);
  });

  it("COV-002: FLAGS (1) when a metric is below the floor", () => {
    expect(run(summaryOf(60), FLOOR)).toBe(1);
  });

  it("COV-003: passes (0) exactly at the floor (boundary)", () => {
    expect(run(summaryOf(80), { lines: 80, statements: 80, functions: 80, branches: 80 })).toBe(0);
  });

  it("COV-004: fails CLOSED (2) when the coverage summary is missing (coverage never ran)", () => {
    expect(run(null, FLOOR)).toBe(2);
  });

  it("COV-005: fails CLOSED (2) when the summary is unparseable garbage", () => {
    expect(run("not json {{{", FLOOR)).toBe(2);
  });

  it("COV-006: fails CLOSED (2) when the summary has no .total block", () => {
    expect(run({ "src/x.ts": {} }, FLOOR)).toBe(2);
  });
});
