// Smoke coverage for scripts/ci/check-no-direct-google-oauth.mjs (AUTH-ARCH-CUTOVER-004) — a
// SECURITY guard that enforces a SINGLE Google OAuth entrypoint. Threat (OWASP A07 Identification
// & Authentication Failures): a second, ad-hoc Google sign-in path bypasses the app's OAuth broker
// (<GoogleSignInButton/>), so redirect/PKCE/consent handling drifts and diverges — the
// duplicate-path bug class. The invariant: any file in src/ or supabase/functions/ (other than the
// allowlisted GoogleSignInButton.tsx / lovable adapter / this guard) that calls
// supabase.auth.signInWithOAuth({ provider: "google" }) or the retired
// lovable.auth.signInWithOAuth("google", …) fails CI.
// These tests prove the guard CATCHES both the supabase and lovable direct paths, honors the
// allowlist escape hatch, and fails closed — run the real guard against fixtures, assert exit codes.
// NOTE: the guard has TWO roots (src, supabase/functions); every non-fail-closed fixture creates
// both so the walk never throws on a missing root.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-no-direct-google-oauth.mjs");

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

describe("check-no-direct-google-oauth security guard (smoke)", () => {
  it("OAUTH-001: passes a src file that does not call Google signInWithOAuth", () => {
    const r = guardFixture({
      "src/pages/Home.tsx": "export function Home() {\n  return null;\n}\n",
      "supabase/functions/keep.md": "makes the second root exist",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("OAUTH-002: FLAGS a direct supabase.auth.signInWithOAuth({ provider: 'google' }) [duplicate path]", () => {
    const r = guardFixture({
      "src/pages/BadLogin.tsx":
        "export async function login(supabase) {\n" +
        '  await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: "/" } });\n' +
        "}\n",
      "supabase/functions/keep.md": "makes the second root exist",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("OAUTH-003: FLAGS the retired lovable.auth.signInWithOAuth('google', …) path", () => {
    const r = guardFixture({
      "src/pages/BadLegacy.tsx":
        "export async function legacyLogin() {\n" +
        '  await lovable.auth.signInWithOAuth("google", { redirectTo: "/" });\n' +
        "}\n",
      "supabase/functions/keep.md": "makes the second root exist",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("OAUTH-004: honors the allowlist escape hatch for src/components/GoogleSignInButton.tsx", () => {
    const r = guardFixture({
      "src/components/GoogleSignInButton.tsx":
        "export async function GoogleSignInButton(supabase) {\n" +
        '  await supabase.auth.signInWithOAuth({ provider: "google", options: {} });\n' +
        "}\n",
      "supabase/functions/keep.md": "makes the second root exist",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("OAUTH-005: fails CLOSED (exit 2) when the roots are missing", () => {
    const r = guardFixture({ "README.md": "no src or functions here" });
    expect(runGuard(r)).toBe(2);
  });

  it("OAUTH-006: fails CLOSED (exit 1) when both roots exist but have zero matching files", () => {
    const r = guardFixture({
      "src/keep.md": "no ts/tsx/mjs/js here",
      "supabase/functions/keep.md": "no ts/tsx/mjs/js here",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("OAUTH-007: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
