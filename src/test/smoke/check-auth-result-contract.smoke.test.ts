// Smoke coverage for scripts/ci/check-auth-result-contract.mjs — an AUTH-LAYER guard that
// fails CI when an auth FLOW returns something other than a Result<AuthOk, AuthErr>. Every
// *.flow.ts under src/features/auth/flows must cross the service→UI boundary as a discriminated
// Result union (referencing AuthResult / AuthOk / AuthErr / the auth-result module, or a
// generic Result<Caps…>). A flow that bare-throws or returns void hands the UI an unmodeled
// failure — the exact shape in which an auth error slips past the boundary untyped and a
// regression goes unhandled. This guard is the tripwire; these tests prove it trips on a
// bare-throw/void flow, stays green on both the AuthResult and generic-Result contract forms,
// and does not vacuously pass — run the real guard against fixtures, assert exit codes.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-auth-result-contract.mjs");

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

describe("check-auth-result-contract auth-layer guard (smoke)", () => {
  it("RESULT-001: passes a flow that returns an AuthResult union", () => {
    const r = guardFixture({
      "src/features/auth/flows/sign-in.flow.ts":
        'import { type AuthResult, ok, err } from "../domain/auth-result";\n' +
        "export async function signIn(): Promise<AuthResult> {\n" +
        '  try { return ok({ kind: "signed_in" }); }\n' +
        '  catch (e) { return err({ code: "unknown" }); }\n' +
        "}\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("RESULT-002: passes a flow satisfying the contract via a generic Result<Caps…>", () => {
    const r = guardFixture({
      "src/features/auth/flows/refresh.flow.ts":
        'import type { Result } from "../../../lib/result";\n' +
        "export function refresh(): Result<CapabilityToken, RefreshDenied> {\n" +
        "  return { ok: true };\n" +
        "}\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("RESULT-003: FLAGS a flow that bare-throws / returns void instead of a Result", () => {
    const r = guardFixture({
      "src/features/auth/flows/legacy.flow.ts":
        "export async function legacySignIn(email: string): Promise<void> {\n" +
        '  if (!email) throw new Error("email required");\n' +
        "  await doSignIn(email);\n" +
        "}\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("RESULT-004: fails CLOSED (exit 2) when src/features/auth/flows is missing", () => {
    const r = guardFixture({ "README.md": "no flows here" });
    expect(runGuard(r)).toBe(2);
  });

  it("RESULT-005: fails CLOSED (exit 1) when the flows root has zero *.flow.ts files to scan", () => {
    const r = guardFixture({
      "src/features/auth/flows/shared-helpers.ts": "export const noop = () => undefined;\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("RESULT-006: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
