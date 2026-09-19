// Smoke coverage for scripts/ci/check-session-timeout-single-owner.mjs (ADR-0049) — the
// guard that keeps the session-timeout policy in ONE module. It proves the guard actually
// CATCHES a second-clock declaration and a redeclared owner constant, PASSES a clean tree
// (imports allowed), and fails closed. Run the real guard against fixtures; assert exit codes.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-session-timeout-single-owner.mjs");

afterAll(cleanupGuardFixtures);

/** Run the real guard with cwd=root; return exit code (0 clean, 1 violation/zero-scan, 2 fail-closed). */
function runGuard(root: string): number {
  try {
    execFileSync("node", [GUARD], { cwd: root, stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("check-session-timeout-single-owner guard (smoke)", () => {
  it("STO-001: PASSES a clean tree — owner declares the constants, others import them", () => {
    const r = guardFixture({
      "src/lib/session-timeout-policy.ts":
        "export const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000;\n" +
        "export const SESSION_IDLE_WARNING_MS = 2 * 60 * 1000;\n" +
        "export const SESSION_ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;\n",
      "src/components/IdleTimeoutGuard.tsx":
        'import { SESSION_IDLE_TIMEOUT_MS } from "@/lib/session-timeout-policy";\n' +
        "export const ms = SESSION_IDLE_TIMEOUT_MS;\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("STO-002: FLAGS a file that REDECLARES an owner constant (a shadow copy that will drift)", () => {
    const r = guardFixture({
      "src/lib/session-timeout-policy.ts":
        "export const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000;\n",
      "src/components/Sneaky.tsx": "const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("STO-003: FLAGS re-introducing a legacy second-clock constant [the two-clock bug]", () => {
    const r = guardFixture({
      "src/features/auth/services/relapse.ts":
        "const MAX_SESSION_AGE_MS = 4 * 60 * 60 * 1000;\n" +
        "export function isMaxAgeExpired(now: number, at: number) { return now - at > MAX_SESSION_AGE_MS; }\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("STO-004: fails CLOSED (exit 2) when src/ is missing", () => {
    const r = guardFixture({ "README.md": "no src here" });
    expect(runGuard(r)).toBe(2);
  });

  it("STO-005: fails CLOSED (exit 1) when src/ has zero .ts/.tsx files to scan", () => {
    const r = guardFixture({ "src/notes.md": "no ts here" });
    expect(runGuard(r)).toBe(1);
  });

  it("STO-006: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
