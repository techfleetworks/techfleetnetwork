// Smoke coverage for scripts/ci/check-auth-direct-signin.mjs — a SECURITY/auth-boundary guard
// that locks the "one password-sign-in owner" invariant: only sign-in.service.ts may call the
// password sign-in SDK, and the active login chain must never re-grow login-with-captcha /
// setSession / setSessionSafe / a legacy AuthService sign-in, nor may session.service.ts regrow
// a password sign-in. A regression here is how a second, unhardened auth entry point silently
// reappears. The guard is cwd-based (reads a fixed set of files under cwd), so we steer it with
// fixtures. These tests prove it catches each forbidden re-introduction and passes clean code.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-auth-direct-signin.mjs");

afterAll(cleanupGuardFixtures);

function runGuard(root: string): number {
  try {
    execFileSync("node", [GUARD], { cwd: root, stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

// The five files the guard requires + inspects; clean content by default.
const CLEAN = "export const ok = true;\n";
function guardedFiles(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    "src/features/auth/services/sign-in.service.ts": CLEAN,
    "src/features/auth/flows/sign-in-password.flow.ts": CLEAN,
    "src/features/auth/engine/use-sign-in-engine.ts": CLEAN,
    "src/features/auth/ui/SignInScreen.tsx": CLEAN,
    "src/features/auth/services/session.service.ts": CLEAN,
    ...overrides,
  };
}

describe("check-auth-direct-signin security guard (smoke)", () => {
  it("ADS-001: passes when every guarded file is present and clean", () => {
    expect(runGuard(guardFixture(guardedFiles()))).toBe(0);
  });

  it("ADS-002: FLAGS a forbidden token (login-with-captcha) in the active sign-in path", () => {
    const r = guardFixture(
      guardedFiles({
        "src/features/auth/services/sign-in.service.ts":
          'const ep = "login-with-captcha";\nexport const ok = true;\n',
      })
    );
    expect(runGuard(r)).toBe(1);
  });

  it("ADS-003: FLAGS session.service.ts re-growing a password sign-in", () => {
    const r = guardFixture(
      guardedFiles({
        "src/features/auth/services/session.service.ts":
          "export async function x() { await supabase.auth.signInWithPassword(c); }\n",
      })
    );
    expect(runGuard(r)).toBe(1);
  });

  it("ADS-004: does NOT false-positive on a forbidden token that appears only in a comment", () => {
    const r = guardFixture(
      guardedFiles({
        "src/features/auth/ui/SignInScreen.tsx":
          "// never call supabase.auth.setSession here\nexport const ok = true;\n",
      })
    );
    expect(runGuard(r)).toBe(0);
  });

  it("ADS-005: fails (exit 1) when a required guarded file is missing", () => {
    // Omit sign-in.service.ts — the guard reports the missing required file.
    const files = guardedFiles();
    delete files["src/features/auth/services/sign-in.service.ts"];
    expect(runGuard(guardFixture(files))).toBe(1);
  });

  it("ADS-006: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
