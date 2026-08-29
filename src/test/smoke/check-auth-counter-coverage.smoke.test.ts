// Smoke coverage for scripts/ci/check-auth-counter-coverage.mjs — a SECURITY guard enforcing
// single-owner accounting of auth failure counters. Threat (OWASP A07 Identification &
// Authentication Failures / broken rate-limiting): if any file outside the AuthFailurePolicy funnel
// increments a failure counter directly, lockout/rate-limit accounting drifts and can be bypassed —
// a brute-force / credential-stuffing exposure. It is the structural backstop behind the ESLint
// rule no-direct-failure-counters (survives an eslint-disable). The invariant: the forbidden
// counter names (record_failed_login, recordInvalidAuthAttempt, recordFailedLoginAttempt,
// RateLimitService.recordFailure) may be invoked ONLY inside the two policy files, the
// src/features/auth/ports/ adapter layer, or the one-release LEGACY_ALLOWED window.
// These tests prove the guard CATCHES each forbidden counter outside the funnel, honors all three
// allow mechanisms, and fails closed — run the real guard against fixtures, assert exit codes.
// NOTE: the guard has TWO roots (src, supabase/functions); every non-fail-closed fixture creates
// both so the walk never throws on a missing root.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-auth-counter-coverage.mjs");

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

describe("check-auth-counter-coverage security guard (smoke)", () => {
  it("COUNTER-001: passes a src file that invokes no forbidden failure counter", () => {
    const r = guardFixture({
      "src/features/dashboard/widget.ts": 'export function render() {\n  return "ok";\n}\n',
      "supabase/functions/keep.md": "makes the second root exist",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("COUNTER-002: FLAGS record_failed_login called outside the failure-policy funnel", () => {
    const r = guardFixture({
      "src/features/attacker/counter.ts":
        "export function onFail(userId) {\n  record_failed_login(userId);\n}\n",
      "supabase/functions/keep.md": "makes the second root exist",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("COUNTER-003: FLAGS recordInvalidAuthAttempt called outside the funnel", () => {
    const r = guardFixture({
      "src/features/attacker/counter.ts":
        "export function onFail(userId) {\n  recordInvalidAuthAttempt(userId);\n}\n",
      "supabase/functions/keep.md": "makes the second root exist",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("COUNTER-004: FLAGS recordFailedLoginAttempt called outside the funnel", () => {
    const r = guardFixture({
      "src/features/attacker/counter.ts":
        "export function onFail(userId) {\n  recordFailedLoginAttempt(userId);\n}\n",
      "supabase/functions/keep.md": "makes the second root exist",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("COUNTER-005: FLAGS RateLimitService.recordFailure called outside the funnel", () => {
    const r = guardFixture({
      "src/features/attacker/counter.ts":
        "export function onFail(userId) {\n  RateLimitService.recordFailure(userId);\n}\n",
      "supabase/functions/keep.md": "makes the second root exist",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("COUNTER-006: honors the exact-path allowlist (auth-failure-policy.ts)", () => {
    const r = guardFixture({
      "src/features/auth/services/auth-failure-policy.ts":
        "export function record(userId) {\n  recordFailedLoginAttempt(userId);\n}\n",
      "supabase/functions/keep.md": "makes the second root exist",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("COUNTER-007: honors the ports/ directory-prefix allowlist", () => {
    const r = guardFixture({
      "src/features/auth/ports/counter-adapter.ts":
        "export function record(userId) {\n  RateLimitService.recordFailure(userId);\n}\n",
      "supabase/functions/keep.md": "makes the second root exist",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("COUNTER-008: honors the one-release LEGACY_ALLOWED window (src/lib/auth-lockout.ts)", () => {
    const r = guardFixture({
      "src/lib/auth-lockout.ts":
        "export function record(userId) {\n  record_failed_login(userId);\n}\n",
      "supabase/functions/keep.md": "makes the second root exist",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("COUNTER-009: fails CLOSED (exit 2) when the roots are missing", () => {
    const r = guardFixture({ "README.md": "no src or functions here" });
    expect(runGuard(r)).toBe(2);
  });

  it("COUNTER-010: fails CLOSED (exit 1) when both roots exist but have zero matching files", () => {
    const r = guardFixture({
      "src/keep.md": "no ts/tsx/js/mjs here",
      "supabase/functions/keep.md": "no ts/tsx/js/mjs here",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("COUNTER-011: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
