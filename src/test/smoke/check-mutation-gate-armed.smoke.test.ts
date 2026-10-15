// Smoke coverage for scripts/ci/check-mutation-gate-armed.mjs — MUT-GATE-001.
// The guard forbids the product-code mutation gate from being disarmed: a non-positive/absent
// `thresholds.break`, an empty `mutate` target, or a mutation workflow that silences its Stryker run
// with `|| true` / `continue-on-error: true`. That is the exact false-green the Oct-2026 audit caught
// (break: 0 could never fail; decisions.md §6). Each scenario writes throwaway config/workflow files
// and points the guard at them via the MUTATION_STRYKER_FILE / MUTATION_WORKFLOW_FILE seams, asserting
// exit codes: armed → 0, disarmed → 1, fail-closed (missing / unrecognizable) → 2. The test FAILS if
// the guard stops detecting, so a broken guard cannot pass (discrimination, per decisions.md §6).
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-mutation-gate-armed.mjs");

afterAll(cleanupGuardFixtures);

const ARMED_CONF = JSON.stringify({
  testRunner: "vitest",
  mutate: ["src/lib/security.ts"],
  thresholds: { high: 80, low: 60, break: 40 },
});

const ARMED_WORKFLOW = `name: Mutation testing (product code)
on:
  pull_request:
jobs:
  stryker:
    runs-on: ubuntu-latest
    steps:
      - run: npm ci
      - run: npm run test:mutation
`;

/**
 * Run the guard with a given config string and workflow string (null = don't write that file, to
 * exercise fail-closed). Returns the exit code.
 */
function run(conf: string | null, workflow: string | null): number {
  const root = guardFixture({});
  let confFile = resolve(root, "nonexistent.json");
  let wfFile = resolve(root, "nonexistent.yml");
  if (conf !== null) {
    confFile = resolve(root, "stryker.conf.json");
    writeFileSync(confFile, conf);
  }
  if (workflow !== null) {
    wfFile = resolve(root, "mutation.yml");
    writeFileSync(wfFile, workflow);
  }
  try {
    execFileSync("node", [GUARD], {
      stdio: "pipe",
      env: { ...process.env, MUTATION_STRYKER_FILE: confFile, MUTATION_WORKFLOW_FILE: wfFile },
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("check-mutation-gate-armed guard (smoke)", () => {
  it("MUTGATE-001: passes (exit 0) when break > 0, mutate non-empty, and the run is un-silenced", () => {
    expect(run(ARMED_CONF, ARMED_WORKFLOW)).toBe(0);
  });

  it("MUTGATE-002: FLAGS (exit 1) break: 0 — the vacuous gate the audit caught", () => {
    const disarmed = ARMED_CONF.replace('"break":40', '"break":0');
    expect(run(disarmed, ARMED_WORKFLOW)).toBe(1);
  });

  it("MUTGATE-003: FLAGS (exit 1) a missing break threshold", () => {
    const noBreak = JSON.stringify({ mutate: ["src/lib/security.ts"], thresholds: { high: 80, low: 60 } });
    expect(run(noBreak, ARMED_WORKFLOW)).toBe(1);
  });

  it("MUTGATE-004: FLAGS (exit 1) an empty mutate target", () => {
    const noTarget = JSON.stringify({ mutate: [], thresholds: { high: 80, low: 60, break: 40 } });
    expect(run(noTarget, ARMED_WORKFLOW)).toBe(1);
  });

  it("MUTGATE-005: FLAGS (exit 1) a Stryker run silenced with `|| true`", () => {
    const silenced = ARMED_WORKFLOW.replace("npm run test:mutation", "npm run test:mutation || true");
    expect(run(ARMED_CONF, silenced)).toBe(1);
  });

  it("MUTGATE-005b: FLAGS (exit 1) a Stryker run silenced with the `|| :` no-op", () => {
    const silenced = ARMED_WORKFLOW.replace("npm run test:mutation", "npm run test:mutation || :");
    expect(run(ARMED_CONF, silenced)).toBe(1);
  });

  it("MUTGATE-006: FLAGS (exit 1) `continue-on-error: true` neutering the step", () => {
    const neutered = ARMED_WORKFLOW.replace("      - run: npm run test:mutation", "      - run: npm run test:mutation\n        continue-on-error: true");
    expect(run(ARMED_CONF, neutered)).toBe(1);
  });

  it("MUTGATE-007: fails CLOSED (exit 2) when stryker.conf.json is missing", () => {
    expect(run(null, ARMED_WORKFLOW)).toBe(2);
  });

  it("MUTGATE-008: fails CLOSED (exit 2) when the config is not a Stryker config", () => {
    expect(run(JSON.stringify({ hello: "world" }), ARMED_WORKFLOW)).toBe(2);
  });

  it("MUTGATE-009: fails CLOSED (exit 2) when the workflow does not run the mutation suite", () => {
    expect(run(ARMED_CONF, "name: something-else\njobs:\n  x:\n    steps:\n      - run: echo hi\n")).toBe(2);
  });
});
