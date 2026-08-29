// Smoke coverage for scripts/ci/check-auth-screen-imports.mjs — an AUTH-LAYER guard
// (AUTH-ARCH-CUTOVER-022) that fails CI when an auth SCREEN reaches past its engine.
// Screens in src/features/auth/ui/* are presentation-only: the sole allowed dependency
// direction is screen → engine → flow → service → adapter. A screen importing the backend
// client, the session port, a use-case service, a flow, or a rate-limit/captcha/lockout
// library directly is how auth boundaries erode silently — the engine stops being the one
// place session/auth decisions happen, and a UI edit can now change auth behavior. This
// guard is the tripwire; these tests prove it actually trips on each forbidden import and
// stays green on a clean screen — run the real guard against fixtures, assert exit codes.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-auth-screen-imports.mjs");

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

describe("check-auth-screen-imports auth-layer guard (smoke)", () => {
  it("SCREEN-001: passes a screen that talks only to its engine (respects the boundary)", () => {
    const r = guardFixture({
      "src/features/auth/ui/SignInScreen.tsx":
        'import { useSignInEngine } from "@/features/auth/engine/use-sign-in-engine";\n' +
        "export default function SignInScreen() {\n" +
        "  const e = useSignInEngine();\n" +
        "  return e.ready ? null : null;\n" +
        "}\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("SCREEN-002: FLAGS a screen importing the backend client directly", () => {
    const r = guardFixture({
      "src/features/auth/ui/SignInScreen.tsx":
        'import { supabase } from "@/integrations/supabase/client";\n' +
        "export default function SignInScreen() { return supabase ? null : null; }\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("SCREEN-003: FLAGS a screen importing the session port directly", () => {
    const r = guardFixture({
      "src/features/auth/ui/SignInScreen.tsx":
        'import { SessionPort } from "@/features/auth/ports/session-port";\n' +
        "export default function SignInScreen() { return null; }\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("SCREEN-004: FLAGS a screen importing a use-case service directly", () => {
    const r = guardFixture({
      "src/features/auth/ui/SignInScreen.tsx":
        'import { signInWithPasswordService } from "@/features/auth/services/sign-in.service";\n' +
        "export default function SignInScreen() { return null; }\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("SCREEN-005: FLAGS a screen importing an auth flow directly", () => {
    const r = guardFixture({
      "src/features/auth/ui/SignInScreen.tsx":
        'import { signInWithPassword } from "@/features/auth/flows/sign-in-password.flow";\n' +
        "export default function SignInScreen() { return null; }\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("SCREEN-006: FLAGS a screen importing the lockout library directly", () => {
    const r = guardFixture({
      "src/features/auth/ui/SignInScreen.tsx":
        'import { checkLockout } from "@/lib/auth-lockout";\n' +
        "export default function SignInScreen() { return null; }\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("SCREEN-007: FLAGS a screen importing the captcha library directly", () => {
    const r = guardFixture({
      "src/features/auth/ui/SignInScreen.tsx":
        'import { verifyCaptcha } from "@/lib/auth-captcha";\n' +
        "export default function SignInScreen() { return null; }\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("SCREEN-008: FLAGS a screen importing the rate-limit service directly", () => {
    const r = guardFixture({
      "src/features/auth/ui/SignInScreen.tsx":
        'import { rateLimit } from "@/services/rate-limit.service";\n' +
        "export default function SignInScreen() { return null; }\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("SCREEN-009: fails CLOSED (exit 2) when src/features/auth/ui is missing", () => {
    const r = guardFixture({ "README.md": "no auth ui here" });
    expect(runGuard(r)).toBe(2);
  });

  it("SCREEN-010: fails CLOSED (exit 1) when the ui root has zero .ts/.tsx files to scan", () => {
    const r = guardFixture({ "src/features/auth/ui/README.md": "no screens here" });
    expect(runGuard(r)).toBe(1);
  });

  it("SCREEN-011: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
