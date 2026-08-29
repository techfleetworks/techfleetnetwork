// Smoke coverage for scripts/ci/check-migrations-applied.mjs — the MIGRATION-APPLIED-001 gate
// (ADR-0020). TFN's DB migrations are hand-applied (`supabase db push`), so a migration can be
// committed, pass migration-smoke (which only proves it applies to a FRESH local Postgres), merge,
// and then silently never reach prod. That exact gap caused the Discord-linking PGRST202 outage
// (migration 20260809161000 committed but never applied). This guard is the ONLY thing that asks
// "are the committed migrations actually live on prod right now?".
//
// The guard reads committed versions from `supabase/migrations/` (cwd-relative) and the prod
// applied-ledger from the Supabase Management API. To exercise its repo↔prod drift-detection
// WITHOUT a live project, it honours a test-only seam MIGRATIONS_APPLIED_FIXTURE (a JSON file of
// [{version}] rows) that stands in for the API — never set in prod/CI. These tests run the REAL
// guard with cwd = a fixture repo and assert exit codes for in-sync / unapplied-drift / extra-drift
// / observe-vs-enforce / fail-closed.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-migrations-applied.mjs");

afterAll(cleanupGuardFixtures);

/**
 * Run the real guard with cwd=root and the given extra env; return exit code
 * (0 = in sync / observe-only / skip, 1 = drift under enforce / fail-closed).
 */
function runGuard(root: string, env: Record<string, string> = {}): number {
  try {
    execFileSync("node", [GUARD], {
      cwd: root,
      stdio: "pipe",
      env: { ...process.env, ...env },
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

/** Seed a fixture repo with the given committed migration versions + an applied-ledger fixture. */
function scenario(
  repoVersions: string[],
  appliedVersions: string[]
): { root: string; applied: string } {
  const files: Record<string, string> = {};
  for (const v of repoVersions) files[`supabase/migrations/${v}_change.sql`] = "select 1;\n";
  // guardFixture needs at least one file to create the root even when repoVersions is empty.
  files["README.md"] = "fixture\n";
  const root = guardFixture(files);
  const applied = resolve(root, "applied.json");
  writeFileSync(applied, JSON.stringify(appliedVersions.map((v) => ({ version: v }))));
  return { root, applied };
}

describe("check-migrations-applied guard (smoke)", () => {
  it("MA-001: passes when every committed migration is applied to prod", () => {
    const { root, applied } = scenario(["001", "002"], ["001", "002"]);
    expect(runGuard(root, { MIGRATIONS_APPLIED_FIXTURE: applied, ENFORCE: "1" })).toBe(0);
  });

  it("MA-002: FLAGS (exit 1) an unapplied committed migration under ENFORCE — the outage case", () => {
    const { root, applied } = scenario(["001", "002"], ["001"]);
    expect(runGuard(root, { MIGRATIONS_APPLIED_FIXTURE: applied, ENFORCE: "1" })).toBe(1);
  });

  it("MA-003: observe window — the same drift only WARNS (exit 0) without ENFORCE", () => {
    const { root, applied } = scenario(["001", "002"], ["001"]);
    expect(runGuard(root, { MIGRATIONS_APPLIED_FIXTURE: applied })).toBe(0);
  });

  it("MA-004: FLAGS (exit 1) history drift — a version on prod but absent from the repo — under ENFORCE", () => {
    const { root, applied } = scenario(["001"], ["001", "999"]);
    expect(runGuard(root, { MIGRATIONS_APPLIED_FIXTURE: applied, ENFORCE: "1" })).toBe(1);
  });

  it("MA-005: fails CLOSED (exit 1) when supabase/migrations is missing", () => {
    const root = guardFixture({ "README.md": "no migrations dir here" });
    const applied = resolve(root, "applied.json");
    writeFileSync(applied, "[]");
    expect(runGuard(root, { MIGRATIONS_APPLIED_FIXTURE: applied, ENFORCE: "1" })).toBe(1);
  });

  it("MA-006: the real repo passes the guard (self-heals to a skip without a token/fixture)", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
