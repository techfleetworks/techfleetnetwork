// Smoke coverage for scripts/ci/check-guards-wired.mjs — GUARDS-WIRED-001, the meta-check that
// makes "a committed guard runs nowhere" (the ADR-0024 gap) structurally impossible: every
// scripts/ci/check-*.mjs must be referenced by a .github/workflows/*.yml job (or be on the
// shrink-only allowlist). This is one of the layers that make it impossible for a guard to silently
// stop protecting (unwired) — alongside check-guard-has-test (untested) and the discrimination gate.
//
// The guard resolves its own paths from its file location (fileURLToPath), so we COPY it into a
// throwaway fixture repo and run the copy; the real guard is exec'd once for the real-repo pass so
// check-guard-has-test credits it.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-guards-wired.mjs");
const GUARD_SRC = readFileSync(GUARD, "utf8");

afterAll(cleanupGuardFixtures);

/** Run the guard at <root>/scripts/ci/check-guards-wired.mjs (a copy); return its exit code. */
function runCopy(root: string): number {
  try {
    execFileSync("node", [resolve(root, "scripts/ci/check-guards-wired.mjs")], { stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

// Every fixture allowlists the copied meta-guard itself so only the TEST guard drives the result.
const BASE = {
  "scripts/ci/check-guards-wired.mjs": GUARD_SRC,
  "scripts/ci/check-foo.mjs": "// a guard\n",
};

describe("check-guards-wired meta-check (smoke)", () => {
  it("GW-001: passes when the guard is referenced by a workflow", () => {
    const r = guardFixture({
      ...BASE,
      "scripts/ci/guards-wired-allowlist.json": '["check-guards-wired.mjs"]',
      ".github/workflows/ci.yml":
        "jobs:\n  x:\n    steps:\n      - run: node scripts/ci/check-foo.mjs\n",
    });
    expect(runCopy(r)).toBe(0);
  });

  it("GW-002: FLAGS (exit 1) a guard referenced by NO workflow — the unwired case", () => {
    const r = guardFixture({
      ...BASE,
      "scripts/ci/guards-wired-allowlist.json": '["check-guards-wired.mjs"]',
      ".github/workflows/ci.yml": "jobs:\n  x:\n    steps:\n      - run: echo nothing\n",
    });
    expect(runCopy(r)).toBe(1);
  });

  it("GW-003: an unwired guard on the shrink-only allowlist is allowed (exit 0)", () => {
    const r = guardFixture({
      ...BASE,
      "scripts/ci/guards-wired-allowlist.json": '["check-guards-wired.mjs","check-foo.mjs"]',
      ".github/workflows/ci.yml": "jobs:\n  x:\n    steps:\n      - run: echo nothing\n",
    });
    expect(runCopy(r)).toBe(0);
  });

  it("GW-004: fails CLOSED (exit 2) when there is no .github/workflows dir", () => {
    const r = guardFixture({
      ...BASE,
      "scripts/ci/guards-wired-allowlist.json": '["check-guards-wired.mjs"]',
      "README.md": "no workflows dir",
    });
    expect(runCopy(r)).toBe(2);
  });

  it("GW-006: a guard named only in a YAML comment / commented-out step is NOT wired (exit 1)", () => {
    const r = guardFixture({
      ...BASE,
      "scripts/ci/guards-wired-allowlist.json": '["check-guards-wired.mjs"]',
      ".github/workflows/ci.yml":
        "jobs:\n  x:\n    steps:\n      # - run: node scripts/ci/check-foo.mjs (disabled)\n      - run: echo nothing\n",
    });
    expect(runCopy(r)).toBe(1);
  });

  it("GW-005: the real repo passes the guard", () => {
    try {
      execFileSync("node", [GUARD], { cwd: REPO, stdio: "pipe" });
      expect(true).toBe(true);
    } catch (e) {
      throw new Error(
        "real-repo check-guards-wired failed: " + ((e as { stdout?: Buffer }).stdout ?? "")
      );
    }
  });
});
