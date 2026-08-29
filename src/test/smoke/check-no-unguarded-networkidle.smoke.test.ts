// Smoke coverage for scripts/ci/check-no-unguarded-networkidle.mjs — a HYGIENE guard.
// INVARIANT: no unguarded waitForLoadState("networkidle") in E2E tests. On pages with Supabase
// realtime/polling the network never goes idle, so an unguarded call burns the full 45s timeout
// per test per shard. A call is GUARDED (allowed) only when this line or the next two chain
// .catch( — e.g. .catch(() => {}) — or the test uses "domcontentloaded" instead. These tests
// run the real guard against fixtures and assert exit codes (0 clean, 1 violation, 2 fail-closed).
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-no-unguarded-networkidle.mjs");

afterAll(cleanupGuardFixtures);

/** Run the real guard with cwd=root; return exit code (0 clean, 1 violation, 2 fail-closed). */
function runGuard(root: string): number {
  try {
    execFileSync("node", [GUARD], { cwd: root, stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("check-no-unguarded-networkidle guard (smoke)", () => {
  it("NET-001: passes an E2E test that uses the safe domcontentloaded wait", () => {
    const r = guardFixture({
      "e2e/clean.spec.ts": 'await page.waitForLoadState("domcontentloaded");\n',
    });
    expect(runGuard(r)).toBe(0);
  });

  it('NET-002: FLAGS an unguarded waitForLoadState("networkidle")', () => {
    const r = guardFixture({
      "e2e/bad.spec.ts": 'await page.waitForLoadState("networkidle");\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("NET-003: passes a networkidle wait guarded inline with .catch(() => {})", () => {
    const r = guardFixture({
      "e2e/guarded.spec.ts": 'await page.waitForLoadState("networkidle").catch(() => {});\n',
    });
    expect(runGuard(r)).toBe(0);
  });

  it("NET-004: passes a networkidle wait guarded by a .catch on the following line", () => {
    const r = guardFixture({
      "e2e/multiline.spec.ts":
        "await page\n" + '  .waitForLoadState("networkidle")\n' + "  .catch(() => {});\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("NET-005: fails CLOSED (exit 2) when the e2e root is missing", () => {
    const r = guardFixture({ "README.md": "no e2e here" });
    expect(runGuard(r)).toBe(2);
  });

  it("NET-006: fails CLOSED (exit 1) when e2e exists but has zero matching source files", () => {
    const r = guardFixture({ "e2e/README.md": "no specs here" });
    expect(runGuard(r)).toBe(1);
  });

  it("NET-007: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
