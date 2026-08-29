// Smoke coverage for scripts/ci/check-support-identity.mjs — the SUPPORT-IDENTITY-001 guard
// (audit T-A). INVARIANT: the support/Freescout subsystem must key on the AUTH uid
// (profiles.user_id = auth.uid()), NEVER the random profiles.id PK. It forbids two shapes:
//   (a) .from("profiles") … .eq("id", <auth-uid-like>)  — profiles.id never equals auth.uid();
//   (b) writing a profiles PK (prof.id) into a *_user_id identity column of a support table.
// Both silently break access. These tests run the real guard against fixtures and assert exit
// codes (0 clean, 1 violation, 2 fail-closed).
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-support-identity.mjs");

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

// The guard scans TWO roots (supabase/functions AND src) and fails closed (exit 2) if EITHER is
// missing. Every non-fail-closed fixture seeds both roots with a benign, rule-clean file so the
// scenario under test — not an accidentally-absent root — is what the exit code reflects.
const BOTH_ROOTS = {
  "supabase/functions/_noop/index.ts": "export const noop = 1;\n",
  "src/_noop.ts": "export const noop = 1;\n",
};

describe("check-support-identity guard (smoke)", () => {
  it('SUP-001: passes a profiles read keyed on the auth uid (.eq("user_id", …))', () => {
    const r = guardFixture({
      ...BOTH_ROOTS,
      "supabase/functions/support-provision/index.ts":
        'const { data } = await supabase.from("profiles").select("id").eq("user_id", session.user.id);\n',
    });
    expect(runGuard(r)).toBe(0);
  });

  it('SUP-002: passes .from("profiles").eq("id", prof.id) — a legit profiles-PK self-reference', () => {
    const r = guardFixture({
      ...BOTH_ROOTS,
      "src/lib/support/updateProfile.ts":
        'await supabase.from("profiles").update({ nickname }).eq("id", prof.id);\n',
    });
    expect(runGuard(r)).toBe(0);
  });

  it('SUP-003: FLAGS .from("profiles").eq("id", userId) — filtering the PK by an auth uid [shape a]', () => {
    const r = guardFixture({
      ...BOTH_ROOTS,
      "supabase/functions/support-provision/bad.ts":
        'const { data } = await supabase.from("profiles").select("*").eq("id", userId);\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("SUP-004: FLAGS writing a profiles PK into support_provisioning_log.user_id [shape b]", () => {
    const r = guardFixture({
      ...BOTH_ROOTS,
      "src/lib/support/provision.ts":
        'await supabase.from("support_provisioning_log").insert({ user_id: prof.id, status: "ok" });\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("SUP-005: FLAGS a profiles PK written into support_ticket_pointers.customer_user_id [shape b]", () => {
    const r = guardFixture({
      ...BOTH_ROOTS,
      "src/lib/support/pointer.ts":
        'await supabase.from("support_ticket_pointers").insert({ customer_user_id: profile.id });\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("SUP-006: does NOT flag the same shape-b violation inside a /test/ path (test exclusion)", () => {
    const r = guardFixture({
      ...BOTH_ROOTS,
      "src/lib/support/test/provision.helper.ts":
        'await supabase.from("support_provisioning_log").insert({ user_id: prof.id });\n',
    });
    expect(runGuard(r)).toBe(0);
  });

  it("SUP-007: fails CLOSED (exit 2) when a scan root (supabase/functions) is missing", () => {
    const r = guardFixture({ "README.md": "no roots here" });
    expect(runGuard(r)).toBe(2);
  });

  it("SUP-008: fails CLOSED (exit 1) when both roots exist but have zero .ts/.tsx files", () => {
    const r = guardFixture({
      "supabase/functions/README.md": "no ts here",
      "src/README.md": "no ts here either",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("SUP-009: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
