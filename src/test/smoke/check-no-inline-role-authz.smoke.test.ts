// Smoke coverage for scripts/ci/check-no-inline-role-authz.mjs — ROLE-AUTHZ-001.
// The guard flags an edge handler that READS user_roles directly (`.from("user_roles")…select`) to make
// an authz decision — a hand-rolled admin check that drifts from the one owner (has_role /
// requireAdminRequest; supabase/functions/CLAUDE.md). It must NOT flag role-management WRITES
// (insert/update/delete) nor the has_role RPC. Each scenario builds a throwaway supabase/functions tree
// + allowlist under the ROLE_AUTHZ_ROOT / ROLE_AUTHZ_ALLOWLIST seams and asserts exit codes:
// new read→1, write→0, has_role→0, grandfathered→0, stale allowlist→1, zero-scan→2. FAILS if the guard
// stops detecting (discrimination, decisions §6).
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-no-inline-role-authz.mjs");

afterAll(cleanupGuardFixtures);

/** Build fixture: one function `fn/index.ts`, optional allowlist; run guard; return exit code. */
function run(
  src: string | null,
  grandfathered: string[] = [],
  fnName = "fn"
): number {
  const root = guardFixture({});
  if (src !== null) {
    const dir = resolve(root, "supabase", "functions", fnName);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "index.ts"), src);
  } else {
    mkdirSync(resolve(root, "supabase", "functions"), { recursive: true });
  }
  const allow = resolve(root, "allow.json");
  writeFileSync(allow, JSON.stringify({ grandfathered }));
  try {
    execFileSync("node", [GUARD], {
      stdio: "pipe",
      env: { ...process.env, ROLE_AUTHZ_ROOT: root, ROLE_AUTHZ_ALLOWLIST: allow },
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const READ = `const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);\n`;
const WRITE = `await supabase.from("user_roles").insert({ user_id: uid, role: "teacher" });\n`;
const HASROLE = `const { data } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });\n`;

describe("check-no-inline-role-authz guard (smoke)", () => {
  it("RA-001: FLAGS (1) a NEW handler that reads user_roles for authz", () => {
    expect(run(READ)).toBe(1);
  });

  it("RA-002: does NOT flag a role-management WRITE (insert) of user_roles", () => {
    expect(run(WRITE)).toBe(0);
  });

  it("RA-003: does NOT flag the has_role RPC (the owner)", () => {
    expect(run(HASROLE)).toBe(0);
  });

  it("RA-004: does NOT flag a read in a grandfathered file", () => {
    expect(run(READ, ["supabase/functions/fn/index.ts"])).toBe(0);
  });

  it("RA-005: FLAGS (1) a stale grandfather entry that no longer reads user_roles (shrink-only)", () => {
    expect(run(WRITE, ["supabase/functions/gone/index.ts"])).toBe(1);
  });

  it("RA-006: fails CLOSED (2) when there are zero edge function files", () => {
    expect(run(null)).toBe(2);
  });
});
