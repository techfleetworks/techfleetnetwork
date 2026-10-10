// Smoke coverage for scripts/ci/check-lighthouse-gate-armed.mjs — LH-GATE-001.
// The guard forbids the Lighthouse workflow from silencing its own lhci assertions with `|| true`
// (or `continue-on-error: true`) — the exact false-green that let an accessibility regression ship
// green (enterprise-readiness audit 2026-10, H1; decisions.md §6). Each scenario writes a throwaway
// workflow file and points the guard at it via the LIGHTHOUSE_GATE_FILE seam, asserting exit codes:
// armed → 0, neutered → 1, and fail-closed (missing / not-an-lhci-file) → 2. The test FAILS if the
// guard stops detecting, so a broken guard cannot pass (discrimination, per decisions.md §6).
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-lighthouse-gate-armed.mjs");

afterAll(cleanupGuardFixtures);

/** Write `content` to a throwaway file and run the guard against it; return the exit code. */
function run(content: string | null): number {
  const root = guardFixture({});
  let file = resolve(root, "nonexistent.yml");
  if (content !== null) {
    file = resolve(root, "lighthouse.yml");
    mkdirSync(resolve(file, ".."), { recursive: true });
    writeFileSync(file, content);
  }
  try {
    execFileSync("node", [GUARD], {
      stdio: "pipe",
      env: { ...process.env, LIGHTHOUSE_GATE_FILE: file },
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const ARMED = `name: Lighthouse CI
jobs:
  lhci:
    steps:
      - run: |
          lhci collect --url=https://www.techfleet.network/ --settings.budgetPath=./lighthouse-budget.json
          lhci assert --assertions.categories:accessibility=error:0.9
`;

describe("check-lighthouse-gate-armed guard (smoke)", () => {
  it("LHGATE-001: passes (exit 0) when lhci runs with no `|| true` / continue-on-error", () => {
    expect(run(ARMED)).toBe(0);
  });

  it("LHGATE-002: FLAGS (exit 1) a trailing `|| true` on an lhci command (the false-green class)", () => {
    expect(run(ARMED.replace("accessibility=error:0.9", "accessibility=error:0.9 || true"))).toBe(1);
  });

  it("LHGATE-003: FLAGS (exit 1) `continue-on-error: true` neutering the lhci step", () => {
    const neutered = ARMED.replace("    steps:", "    steps:\n      - continue-on-error: true");
    expect(run(neutered)).toBe(1);
  });

  it("LHGATE-004: also catches the `|| :` no-op variant", () => {
    expect(run(ARMED.replace("accessibility=error:0.9", "accessibility=error:0.9 || :"))).toBe(1);
  });

  it("LHGATE-005: fails CLOSED (exit 2) when the file is missing (wrong path)", () => {
    expect(run(null)).toBe(2);
  });

  it("LHGATE-006: fails CLOSED (exit 2) when the file does not reference lhci (gate removed / wrong file)", () => {
    expect(run("name: something-else\njobs:\n  x:\n    steps:\n      - run: echo hi\n")).toBe(2);
  });
});
