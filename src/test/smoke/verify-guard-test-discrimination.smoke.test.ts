// Smoke coverage for scripts/ci/verify-guard-test-discrimination.mjs — the DISCRIMINATION
// gate (mutation-tests every guard's test; ADR-0023). It is a mutation-testing JOB, not a
// scanning guard: its full mutation behaviour (no-op each guard, require its test to fail) is
// verified by its dedicated required CI job on the real repo — we deliberately do NOT run that
// path inside the vitest suite, because it mutates real guard files and would race other tests.
//
// These tests pin its FAIL-CLOSED and early-exit paths, which run BEFORE any mutation/vitest, via
// the GUARD_DISCRIMINATE_ROOT override pointing at throwaway fixtures. A gate that guards quality
// must itself fail closed on missing inputs.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GATE = resolve(REPO, "scripts/ci/verify-guard-test-discrimination.mjs");

afterAll(cleanupGuardFixtures);

/** Run the gate pointed at a fixture repo; return exit code (0 clean, 2 fail-closed). */
function runGate(root: string): number {
  try {
    execFileSync("node", [GATE], {
      stdio: "pipe",
      env: { ...process.env, GUARD_DISCRIMINATE_ROOT: root },
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const STUB = "#!/usr/bin/env node\nprocess.exit(0);\n";

describe("verify-guard-test-discrimination fail-closed (smoke)", () => {
  it("VGD-001: fails CLOSED (exit 2) when scripts/ci is missing", () => {
    expect(runGate(guardFixture({ "README.md": "no ci here" }))).toBe(2);
  });

  it("VGD-002: fails CLOSED (exit 2) when the allowlist JSON is missing", () => {
    expect(runGate(guardFixture({ "scripts/ci/check-fake.mjs": STUB }))).toBe(2);
  });

  it("VGD-003: fails CLOSED (exit 2) when src/test is missing (with a tested guard present)", () => {
    const r = guardFixture({
      "scripts/ci/check-fake.mjs": STUB,
      "scripts/ci/guard-test-allowlist.json": "[]", // check-fake is TESTED (not allowlisted)
    });
    expect(runGate(r)).toBe(2);
  });

  it("VGD-004: fails CLOSED (exit 2) when a tested guard has no test mapped to it", () => {
    const r = guardFixture({
      "scripts/ci/check-fake.mjs": STUB,
      "scripts/ci/guard-test-allowlist.json": "[]",
      "src/test/smoke/unrelated.smoke.test.ts": 'import {} from "vitest";\n', // references no guard
    });
    expect(runGate(r)).toBe(2);
  });

  it("VGD-005: exits 0 (nothing to mutate) when every guard is on the allowlist", () => {
    const r = guardFixture({
      "scripts/ci/check-fake.mjs": STUB,
      "scripts/ci/guard-test-allowlist.json": '["check-fake.mjs"]', // check-fake untested/allowlisted
      "src/test/smoke/unrelated.smoke.test.ts": 'import {} from "vitest";\n',
    });
    expect(runGate(r)).toBe(0);
  });
});
