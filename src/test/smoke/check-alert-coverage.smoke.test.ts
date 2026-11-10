// Smoke coverage for scripts/ci/check-alert-coverage.mjs — ALERT-COVERAGE-001.
// The guard keeps the main-failure alert from silently regressing (re-audit 2026-10-30 RH4/SRE-1..3;
// ADR 20261110-alerting-cannot-go-dark): every production-critical workflow must be watched, every
// watched name must resolve to a real workflow (no typo'd dark entry), and the alert must declare
// `issues: write` + a `gh issue create` fallback so it can't go dark when the Discord webhook is unset.
// Each scenario builds a throwaway .github/workflows tree under the ALERT_WORKFLOWS_DIR / ALERT_CRITICAL
// seams and asserts exit codes: clean->0, coverage gap->1, dangling watch->1, no issues:write->1, no
// fallback->1, no-block-list->1, failure-only (timed_out would go dark)->1, comment-only fallback->1,
// missing dir->2, zero workflows->2. FAILS if the guard stops detecting (discrimination, decisions §6).
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-alert-coverage.mjs");

afterAll(cleanupGuardFixtures);

const ALERT_OK = `name: Main failure alert
on:
  workflow_run:
    workflows:
      - "CI"
      - "Deploy frontend (Cloudflare)"
    types: [completed]
permissions:
  contents: read
  issues: write
jobs:
  alert:
    if: contains(fromJSON('["failure","timed_out","startup_failure"]'), github.event.workflow_run.conclusion)
    steps:
      - run: gh issue create --title x
`;

/**
 * Build a workflows dir fixture. `alert` is the main-failure-alert.yml body; `others` maps extra
 * workflow filenames -> their `name:`-bearing body. `omitDir` points the guard at a missing dir.
 * `critical` overrides the required set. Returns the exit code.
 */
function run(
  alert: string | null,
  others: Record<string, string>,
  critical: string,
  omitDir = false
): number {
  const root = guardFixture({});
  const dir = resolve(root, "workflows");
  if (!omitDir) {
    mkdirSync(dir, { recursive: true });
    if (alert !== null) writeFileSync(resolve(dir, "main-failure-alert.yml"), alert);
    for (const [name, body] of Object.entries(others)) writeFileSync(resolve(dir, name), body);
  }
  try {
    execFileSync("node", [GUARD], {
      stdio: "pipe",
      env: { ...process.env, ALERT_WORKFLOWS_DIR: dir, ALERT_CRITICAL: critical },
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const REAL = { "ci.yml": "name: CI\n", "dep.yml": "name: Deploy frontend (Cloudflare)\n" };
const BOTH = "CI,Deploy frontend (Cloudflare)";

describe("check-alert-coverage guard (smoke)", () => {
  it("AC-001: passes (0) when all critical workflows are watched, resolve, and the fallback exists", () => {
    expect(run(ALERT_OK, REAL, BOTH)).toBe(0);
  });

  it("AC-002: FLAGS (1) a critical workflow that is not watched", () => {
    expect(run(ALERT_OK, REAL, "CI,Deploy frontend (Cloudflare),Deploy migrations")).toBe(1);
  });

  it("AC-003: FLAGS (1) a watched entry that matches no real workflow name (typo'd dark entry)", () => {
    const typo = ALERT_OK.replace('- "CI"', '- "CII"');
    expect(run(typo, REAL, BOTH)).toBe(1);
  });

  it("AC-004: FLAGS (1) a missing `issues: write` permission (fallback can't open an issue)", () => {
    const noPerm = ALERT_OK.replace(/\s*issues: write/, "");
    expect(run(noPerm, REAL, BOTH)).toBe(1);
  });

  it("AC-005: FLAGS (1) a missing `gh issue create` fallback (would go dark without the webhook)", () => {
    const noFallback = ALERT_OK.replace(/\s*- run: gh issue create --title x/, "");
    expect(run(noFallback, REAL, BOTH)).toBe(1);
  });

  it("AC-006: FLAGS (1) an alert with no workflow_run.workflows block-list", () => {
    const noList = `name: Main failure alert
on:
  workflow_run:
    types: [completed]
permissions:
  issues: write
jobs:
  alert:
    steps:
      - run: gh issue create --title x
`;
    expect(run(noList, REAL, BOTH)).toBe(1);
  });

  it("AC-007: FLAGS (1) an alert that fires only on `failure` (a timed-out run would go dark)", () => {
    const failureOnly = ALERT_OK.replace(
      /if: contains\(fromJSON\('\["failure","timed_out","startup_failure"\]'\), github\.event\.workflow_run\.conclusion\)/,
      "if: github.event.workflow_run.conclusion == 'failure'"
    );
    expect(run(failureOnly, REAL, BOTH)).toBe(1);
  });

  it("AC-008: FLAGS (1) a `gh issue create` that exists only in a comment (not a live fallback)", () => {
    const commentedFallback = ALERT_OK.replace(
      "      - run: gh issue create --title x",
      "      - run: echo noop   # was: gh issue create --title x"
    );
    expect(run(commentedFallback, REAL, BOTH)).toBe(1);
  });

  it("AC-009: fails CLOSED (2) when the workflows dir does not exist", () => {
    expect(run(ALERT_OK, REAL, BOTH, true)).toBe(2);
  });

  it("AC-010: fails CLOSED (2) when the workflows dir has no .yml files", () => {
    const root = guardFixture({});
    const dir = resolve(root, "empty-workflows");
    mkdirSync(dir, { recursive: true });
    let code: number;
    try {
      execFileSync("node", [GUARD], {
        stdio: "pipe",
        env: { ...process.env, ALERT_WORKFLOWS_DIR: dir, ALERT_CRITICAL: BOTH },
      });
      code = 0;
    } catch (e) {
      code = (e as { status?: number }).status ?? 1;
    }
    rmSync(dir, { recursive: true, force: true });
    expect(code).toBe(2);
  });
});
