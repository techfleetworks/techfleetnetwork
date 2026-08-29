// Smoke coverage for scripts/ci/check-auth-engine-swallow.mjs (AUTH-ARCH-CUTOVER-011) — a
// SECURITY/observability guard that fails CI when an auth-engine catch block SWALLOWS an error
// without emitting telemetry. Threat (OWASP A09 Security Logging & Monitoring Failures): a catch
// that recovers/returns silently hides an auth failure from every alert, dashboard and audit
// trail — the exact class that produced the silent reset-email outage (June 11–15, 2026). The
// invariant: every `catch (...) { ... }` under src/features/auth/engine must call
// telemetryPort.record( or telemetryPort.captcha( in its body.
// These tests prove the guard actually CATCHES a swallowing catch and passes an instrumented one —
// run the real guard against fixtures, assert exit codes.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-auth-engine-swallow.mjs");

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

describe("check-auth-engine-swallow security guard (smoke)", () => {
  it("SWALLOW-001: passes a catch block that records telemetry via telemetryPort.record()", () => {
    const r = guardFixture({
      "src/features/auth/engine/verify.ts":
        "export async function verify() {\n" +
        "  try {\n" +
        "    await doThing();\n" +
        "  } catch (err) {\n" +
        '    telemetryPort.record("auth_engine.verify_failed", { err });\n' +
        "    throw err;\n" +
        "  }\n" +
        "}\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("SWALLOW-002: passes a catch block that records via the telemetryPort.captcha() branch", () => {
    const r = guardFixture({
      "src/features/auth/engine/captcha.ts":
        "export async function gate() {\n" +
        "  try {\n" +
        "    await solve();\n" +
        "  } catch (err) {\n" +
        '    telemetryPort.captcha("auth_engine.captcha_failed", { err });\n' +
        "    throw err;\n" +
        "  }\n" +
        "}\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("SWALLOW-003: FLAGS a catch block that swallows the error with no telemetry [silent outage class]", () => {
    const r = guardFixture({
      "src/features/auth/engine/verify.ts":
        "export async function verify() {\n" +
        "  try {\n" +
        "    await doThing();\n" +
        "  } catch (err) {\n" +
        "    return null;\n" +
        "  }\n" +
        "}\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("SWALLOW-004: fails CLOSED (exit 2) when src/features/auth/engine is missing", () => {
    const r = guardFixture({ "README.md": "no engine here" });
    expect(runGuard(r)).toBe(2);
  });

  it("SWALLOW-005: fails CLOSED (exit 1) when the engine root has zero .ts/.tsx files to scan", () => {
    const r = guardFixture({ "src/features/auth/engine/notes.md": "no ts here" });
    expect(runGuard(r)).toBe(1);
  });

  it("SWALLOW-006: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
