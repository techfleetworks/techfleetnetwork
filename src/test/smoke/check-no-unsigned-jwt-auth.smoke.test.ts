// Smoke coverage for scripts/ci/check-no-unsigned-jwt-auth.mjs — a SECURITY guard that fails
// CI when an edge function authorizes on an UNVERIFIED JWT claim or on the public anon key.
// It defends against the two auth-bypass classes from the 2026-08 audit:
//   C1 — trusting a base64-DECODED (unverified) `role === "service_role"` claim: an attacker
//        forges an unsigned token whose payload claims service_role and gets admin access.
//   C2 — gating privilege on `.includes(ANON_KEY)`: the anon key is PUBLIC, so anyone can pass.
// These tests prove the guard actually CATCHES both bypasses and passes correct constant-time
// service-role matching — run the real guard against fixtures, assert exit codes.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-no-unsigned-jwt-auth.mjs");

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

describe("check-no-unsigned-jwt-auth security guard (smoke)", () => {
  it("JWT-001: passes an edge fn that uses an exact service-role match (no bypass)", () => {
    const r = guardFixture({
      "supabase/functions/ok/index.ts":
        'import { authorizeServiceRoleRequest } from "../_shared/service-role-auth.ts";\n' +
        "const ok = await authorizeServiceRoleRequest(req);\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("JWT-002: FLAGS trusting a decoded (unverified) role==='service_role' claim [C1 bypass]", () => {
    const r = guardFixture({
      "supabase/functions/bad/index.ts":
        'const payload = JSON.parse(atob(token.split(".")[1]));\n' +
        'if (payload.role === "service_role") { grantAdmin(); }\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("JWT-003: FLAGS authorizing via .includes() of the public ANON key [C2 bypass]", () => {
    const r = guardFixture({
      "supabase/functions/bad2/index.ts":
        "if (authHeader.includes(SUPABASE_ANON_KEY)) { grantAdmin(); }\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("JWT-004: honors the // @safe-service-auth escape hatch on a justified file", () => {
    const r = guardFixture({
      "supabase/functions/safe/index.ts":
        "// @safe-service-auth: verified upstream, decode is for logging only\n" +
        "const payload = JSON.parse(atob(token));\n" +
        'if (payload.role === "service_role") {}\n',
    });
    expect(runGuard(r)).toBe(0);
  });

  it("JWT-005: fails CLOSED (exit 2) when supabase/functions is missing", () => {
    const r = guardFixture({ "README.md": "no functions here" });
    expect(runGuard(r)).toBe(2);
  });

  it("JWT-006: fails CLOSED (exit 1) when the root has zero .ts files to scan", () => {
    const r = guardFixture({ "supabase/functions/readme.md": "no ts here" });
    expect(runGuard(r)).toBe(1);
  });

  it("JWT-007: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
