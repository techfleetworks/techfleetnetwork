// Smoke coverage for scripts/ci/check-progress-read-identity.mjs — the JOURNEY-IDENTITY-003
// guard. INVARIANT: every client read against journey_progress / course_completions /
// badges_awarded / journey_phase_definitions must filter by the SESSION user id (user.id),
// NEVER by the profiles-table PK (profile.id / currentProfile.id / p.id). profile.id does NOT
// equal auth.uid(), so filtering by it returns zero rows under RLS and silently regresses
// completion state. These tests run the real guard against fixtures and assert exit codes
// (0 clean, 1 violation, 2 fail-closed).
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-progress-read-identity.mjs");

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

describe("check-progress-read-identity guard (smoke)", () => {
  it("PROG-001: passes a progress read filtered by the session user.id", () => {
    const r = guardFixture({
      "src/hooks/useProgress.ts":
        'const { data } = await supabase.from("journey_progress").select("*").eq("user_id", user.id);\n',
    });
    expect(runGuard(r)).toBe(0);
  });

  it('PROG-002: passes .eq("user_id", profile.user_id) — the FK column is the correct arg', () => {
    const r = guardFixture({
      "src/hooks/useBadges.ts":
        'const { data } = await supabase.from("badges_awarded").select("*").eq("user_id", profile.user_id);\n',
    });
    expect(runGuard(r)).toBe(0);
  });

  it("PROG-003: FLAGS filtering a progress table by the bare profiles PK (profile.id)", () => {
    const r = guardFixture({
      "src/hooks/useBad.ts":
        'const { data } = await supabase.from("journey_progress").select("*").eq("user_id", profile.id);\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("PROG-004: FLAGS currentProfile.id as the user_id filter on course_completions", () => {
    const r = guardFixture({
      "src/hooks/useComplete.ts":
        'await supabase.from("course_completions").delete().eq("user_id", currentProfile.id);\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("PROG-005: FLAGS profile.id embedded in a larger user_id expression (no user_id token)", () => {
    const r = guardFixture({
      "src/hooks/useEmbedded.ts":
        'await supabase.from("journey_phase_definitions").select().eq("user_id", profile.id ?? "");\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("PROG-006: does NOT flag profile.id when no guarded table is touched (table-scoped)", () => {
    const r = guardFixture({
      "src/hooks/useUnrelated.ts":
        'await supabase.from("some_other_table").select().eq("user_id", profile.id);\n',
    });
    expect(runGuard(r)).toBe(0);
  });

  it("PROG-007: fails CLOSED (exit 2) when the src root is missing", () => {
    const r = guardFixture({ "README.md": "no src here" });
    expect(runGuard(r)).toBe(2);
  });

  it("PROG-008: fails CLOSED (exit 1) when src exists but has zero .ts/.tsx files to scan", () => {
    const r = guardFixture({ "src/README.md": "no source here" });
    expect(runGuard(r)).toBe(1);
  });

  it("PROG-009: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
