// Smoke coverage for scripts/ci/check-migration-expand-contract.mjs — EXPAND-CONTRACT-001.
// The guard forbids a destructive, in-place column change (DROP/RENAME COLUMN, ALTER TYPE, SET NOT
// NULL) in a migration unless it is pre-existing (grandfathered) or carries a reviewed
// `-- expand-contract-ok: <reason>` annotation — the slip class that breaks still-running old code
// mid-deploy (decisions.md §7; enterprise-readiness audit 2026-10 C3). Each scenario builds a
// throwaway migrations tree + allowlist under the EXPAND_CONTRACT_ROOT/EXPAND_CONTRACT_ALLOWLIST
// seams and asserts exit codes: clean→0, un-annotated destructive→1, annotated→0, grandfathered→0,
// stale allowlist→1, zero-scan→2. FAILS if the guard stops detecting (discrimination, decisions §6).
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-migration-expand-contract.mjs");

afterAll(cleanupGuardFixtures);

/**
 * Build a fixture: `migrations` maps filename → SQL; `grandfathered` is the allowlist array.
 * `omitDir` skips creating the migrations dir entirely (fail-closed path). Returns the exit code.
 */
function run(
  migrations: Record<string, string>,
  grandfathered: string[] = [],
  omitDir = false
): number {
  const root = guardFixture({});
  if (!omitDir) {
    const dir = resolve(root, "supabase", "migrations");
    mkdirSync(dir, { recursive: true });
    for (const [name, sql] of Object.entries(migrations)) writeFileSync(resolve(dir, name), sql);
  }
  const allowlist = resolve(root, "allow.json");
  writeFileSync(allowlist, JSON.stringify({ grandfathered }));
  try {
    execFileSync("node", [GUARD], {
      stdio: "pipe",
      env: {
        ...process.env,
        EXPAND_CONTRACT_ROOT: root,
        EXPAND_CONTRACT_ALLOWLIST: allowlist,
      },
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const ADDITIVE = "ALTER TABLE public.t ADD COLUMN IF NOT EXISTS c text;\n";
const DROP = "ALTER TABLE public.t DROP COLUMN old_c;\n";
const RENAME = "ALTER TABLE public.t RENAME COLUMN a TO b;\n";

describe("check-migration-expand-contract guard (smoke)", () => {
  it("EC-001: passes (0) when migrations are additive (expand only)", () => {
    expect(run({ "20260101000000_add.sql": ADDITIVE })).toBe(0);
  });

  it("EC-002: FLAGS (1) an un-annotated DROP COLUMN (breaks running old code)", () => {
    expect(run({ "20260101000000_drop.sql": DROP })).toBe(1);
  });

  it("EC-003: FLAGS (1) an un-annotated RENAME COLUMN", () => {
    expect(run({ "20260101000000_rename.sql": RENAME })).toBe(1);
  });

  it("EC-004: ALLOWS (0) a destructive change that carries the reviewed annotation", () => {
    expect(
      run({
        "20260101000000_drop.sql": "-- expand-contract-ok: no code reads old_c since v2\n" + DROP,
      })
    ).toBe(0);
  });

  it("EC-005: ALLOWS (0) a destructive change in a grandfathered file", () => {
    expect(run({ "legacy_rename.sql": RENAME }, ["legacy_rename.sql"])).toBe(0);
  });

  it("EC-006: a DROP COLUMN appearing only in a `--` comment is NOT flagged", () => {
    expect(run({ "20260101000000_c.sql": "-- example: ALTER TABLE t DROP COLUMN x;\n" + ADDITIVE })).toBe(0);
  });

  it("EC-007: FLAGS (1) a stale grandfather entry that no longer exists (shrink-only)", () => {
    expect(run({ "20260101000000_add.sql": ADDITIVE }, ["gone.sql"])).toBe(1);
  });

  it("EC-008: fails CLOSED (2) when there is no migrations dir", () => {
    expect(run({}, [], true)).toBe(2);
  });

  it("EC-009: fails CLOSED (2) when the migrations dir has zero .sql files", () => {
    expect(run({})).toBe(2);
  });
});
