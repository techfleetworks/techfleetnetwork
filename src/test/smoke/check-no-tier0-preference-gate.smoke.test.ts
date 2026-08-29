// Smoke coverage for scripts/ci/check-no-tier0-preference-gate.mjs — a BLOCKING guard that fails
// CI when a critical (Tier 0) email sender gates on a member preference. Tier-0 mail (interview
// invites, applicant status, observer grants, the agreement offer, …) must ALWAYS send; only
// global suppression may stop it. The original bug gated these on `notify_announcements`
// (default false), silently dropping critical mail for ~87% of users. The guard scans each
// sender subdir of supabase/functions (every direct child except _shared / allowlist) for reads
// of `notify_announcements` / `notify_training_opportunities`; the allowlist is currently EMPTY.
// These tests prove the guard CATCHES each forbidden preference read, ignores a mention that is
// only in a comment, and fails closed. NOTE: this guard resolves its sender roots at module load
// (a top-level readdirSync of supabase/functions), so its fail-closed surface differs from a pure
// harness guard — see TIER0-005 (no sender roots → misconfig exit 2) vs TIER0-006 (functions dir
// absent → the module-load readdir throws → Node exit 1). Both fail closed; neither is a green.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-no-tier0-preference-gate.mjs");

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

describe("check-no-tier0-preference-gate guard (smoke)", () => {
  it("TIER0-001: passes a sender that selects recipients by notify_opportunities (not gated)", () => {
    const r = guardFixture({
      "supabase/functions/send-interview-invite/index.ts":
        "const recipients = members.filter((m) => m.notify_opportunities);\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("TIER0-002: FLAGS a sender that reads notify_announcements", () => {
    const r = guardFixture({
      "supabase/functions/send-interview-invite/index.ts":
        "const gated = member.notify_announcements === true;\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("TIER0-003: FLAGS a sender that reads notify_training_opportunities", () => {
    const r = guardFixture({
      "supabase/functions/send-observer-grant/index.ts":
        'const q = supabase.from("members").eq("notify_training_opportunities", true);\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("TIER0-004: does NOT flag a preference name that appears only inside a comment", () => {
    const r = guardFixture({
      "supabase/functions/send-agreement-offer/index.ts":
        "// historically this gated on notify_announcements — removed at the v2 cutover\n" +
        "await sendCriticalEmail(member);\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("TIER0-005: fails CLOSED (exit 2) when functions exists but has no sender subdirs", () => {
    // Only _shared present → zero sender roots resolve → runScanGuard misconfig guard (exit 2).
    const r = guardFixture({
      "supabase/functions/_shared/email-tiers.ts": "export const TIER0 = 0;\n",
    });
    expect(runGuard(r)).toBe(2);
  });

  it("TIER0-006: fails CLOSED (exit 1) when supabase/functions is absent (module-load readdir throws)", () => {
    const r = guardFixture({ "README.md": "no functions dir here" });
    expect(runGuard(r)).toBe(1);
  });

  it("TIER0-007: fails CLOSED (exit 1) when a sender dir has zero .ts files to scan", () => {
    const r = guardFixture({ "supabase/functions/send-interview-invite/readme.md": "no ts here" });
    expect(runGuard(r)).toBe(1);
  });

  it("TIER0-008: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
