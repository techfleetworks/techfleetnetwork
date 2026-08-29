// Smoke coverage for scripts/ci/check-progress-identity-sql-smoke.mjs — the JOURNEY-IDENTITY-001
// runtime RLS probe. It calls member_progress_self_check() as a real signed-in member and asserts
// auth.uid() can actually READ the member's progress rows (journey_progress / course_completions).
// This catches a live RLS/identity regression that the static JOURNEY-IDENTITY-003 scan
// (check-progress-read-identity) cannot — the two are complementary, not redundant.
//
// The RPC response normally comes from a live Supabase + member JWT. To exercise the guard's
// row-count detection WITHOUT those secrets, it honours a test-only seam PROGRESS_IDENTITY_FIXTURE
// (a JSON file standing in for the RPC row) — never set in prod/CI. These tests run the REAL guard
// and assert exit codes for healthy rows / zero-visible-rows (the RLS-regression case) / a missing
// course-completion / the self-healing skip.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-progress-identity-sql-smoke.mjs");

afterAll(cleanupGuardFixtures);

/** Run the real guard with the given env; return exit code (0 healthy/skip, 1 identity regression). */
function runGuard(env: Record<string, string> = {}): number {
  try {
    execFileSync("node", [GUARD], { stdio: "pipe", env: { ...process.env, ...env } });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

/** Write an RPC-response fixture and return its absolute path. */
function fixture(row: Record<string, number>): string {
  const root = guardFixture({ "README.md": "fixture\n" });
  const p = resolve(root, "rpc.json");
  writeFileSync(p, JSON.stringify(row));
  return p;
}

describe("check-progress-identity-sql-smoke guard (smoke)", () => {
  it("PIS-001: passes when the member can read journey, completed, and course rows", () => {
    const p = fixture({ journey_rows: 2, completed_rows: 1, course_completion_rows: 1 });
    expect(runGuard({ PROGRESS_IDENTITY_FIXTURE: p })).toBe(0);
  });

  it("PIS-002: FLAGS (exit 1) zero visible journey rows — the RLS/identity regression", () => {
    const p = fixture({ journey_rows: 0, completed_rows: 1, course_completion_rows: 1 });
    expect(runGuard({ PROGRESS_IDENTITY_FIXTURE: p })).toBe(1);
  });

  it("PIS-003: FLAGS (exit 1) a member who can see progress but no course completions", () => {
    const p = fixture({ journey_rows: 2, completed_rows: 2, course_completion_rows: 0 });
    expect(runGuard({ PROGRESS_IDENTITY_FIXTURE: p })).toBe(1);
  });

  it("PIS-004: self-heals to a skip (exit 0) without a backend env / member JWT", () => {
    const env = { ...process.env } as Record<string, string>;
    delete env.SUPABASE_URL;
    delete env.VITE_SUPABASE_URL;
    delete env.PROGRESS_IDENTITY_FIXTURE;
    try {
      execFileSync("node", [GUARD], { stdio: "pipe", env });
      expect(true).toBe(true);
    } catch (e) {
      expect((e as { status?: number }).status).toBeUndefined();
    }
  });
});
