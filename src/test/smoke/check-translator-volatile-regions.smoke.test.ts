// Smoke coverage for scripts/ci/check-translator-volatile-regions.mjs — the
// TRANSLATOR-VOLATILE-003 hygiene guard. INVARIANT: a JSX file must not add an aria-live region
// or a volatile role (status/alert/log/timer) without a data-no-translate / translate="no"
// opt-out — otherwise the runtime translator mutates fast-changing content mid-update — UNLESS
// the file is on the snapshot allow-list (regions the translator already skips). The guard reads
// scripts/ci/translator-volatile-regions.snapshot.json via process.cwd() at load time, so EVERY
// fixture ships a snapshot or the guard would crash before its logic runs. Exit codes: 0 clean,
// 1 violation, 2 fail-closed. (Real-repo result is 0 — the harness normalizes paths to forward
// slashes so the allow-list matches on Windows too.)
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-translator-volatile-regions.mjs");
const SNAP = "scripts/ci/translator-volatile-regions.snapshot.json";

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

describe("check-translator-volatile-regions guard (smoke)", () => {
  it("TRANS-001: passes a volatile region carrying the data-no-translate opt-out", () => {
    const r = guardFixture({
      [SNAP]: '{ "allow_files": [] }',
      "src/components/Status.tsx":
        'export const Status = () => (\n  <div aria-live="polite" data-no-translate>Saving</div>\n);\n',
    });
    expect(runGuard(r)).toBe(0);
  });

  it("TRANS-002: FLAGS an aria-live region with no opt-out on a non-allow-listed file", () => {
    const r = guardFixture({
      [SNAP]: '{ "allow_files": [] }',
      "src/components/Toast.tsx":
        'export const Toast = () => (\n  <div aria-live="assertive">Error occurred</div>\n);\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it('TRANS-003: FLAGS a volatile role="status" region with no opt-out', () => {
    const r = guardFixture({
      [SNAP]: '{ "allow_files": [] }',
      "src/components/Counter.tsx":
        'export const Counter = () => (\n  <div role="status">Loading results</div>\n);\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("TRANS-004: passes an un-opted volatile region when the file is on the snapshot allow-list", () => {
    const r = guardFixture({
      [SNAP]: '{ "allow_files": ["src/components/Foo.tsx"] }',
      "src/components/Foo.tsx":
        'export const Foo = () => (\n  <div role="alert">Something failed</div>\n);\n',
    });
    expect(runGuard(r)).toBe(0);
  });

  it("TRANS-005: passes an un-opted volatile region on a hard-coded allow-listed path", () => {
    const r = guardFixture({
      [SNAP]: '{ "allow_files": [] }',
      "src/components/LiveAnnouncer.tsx":
        'export const LiveAnnouncer = () => (\n  <div role="log">announcement</div>\n);\n',
    });
    expect(runGuard(r)).toBe(0);
  });

  it("TRANS-006: fails CLOSED (exit 2) when the src root is missing", () => {
    const r = guardFixture({ [SNAP]: '{ "allow_files": [] }' });
    expect(runGuard(r)).toBe(2);
  });

  it("TRANS-007: fails CLOSED (exit 1) when src exists but has zero .tsx/.jsx files", () => {
    const r = guardFixture({
      [SNAP]: '{ "allow_files": [] }',
      "src/README.md": "no jsx here",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("TRANS-008: the real repo passes the guard (0 violations)", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
