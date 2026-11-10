// Smoke coverage for scripts/ci/check-migration-expand-contract.mjs — EXPAND-CONTRACT-001.
// The guard forbids a destructive / lock-taking schema change in a migration unless it is pre-existing
// (grandfathered) or carries a reviewed `-- expand-contract-ok: <reason>` annotation — the slip class
// that breaks still-running old code, or takes a blocking lock, mid-deploy (decisions.md §7;
// enterprise-readiness audit 2026-10 C3; re-audit 2026-10-30 REL-4/DB-3; ADR 20261110). The guard was
// widened 2026-11-10 from four column rules to the full expand/contract rule set, STATEMENT-level
// matching (multi-line safe), and PER-STATEMENT annotations. Each scenario builds a throwaway
// migrations tree + allowlist under the EXPAND_CONTRACT_ROOT/EXPAND_CONTRACT_ALLOWLIST seams and
// asserts exit codes: clean→0, un-annotated destructive→1, annotated→0, grandfathered→0, stale
// allowlist→1, zero-scan→2. FAILS if the guard stops detecting ANY rule (discrimination, decisions §6).
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

  // --- widened rule set (2026-11-10, ADR 20261110). Each un-annotated form must RED (1). ---
  it.each([
    ["EC-010 DROP TABLE", "DROP TABLE public.t;\n"],
    ["EC-011 TRUNCATE", "TRUNCATE public.t;\n"],
    ["EC-012 RENAME TO (table)", "ALTER TABLE public.t RENAME TO t2;\n"],
    ["EC-013 DROP FUNCTION", "DROP FUNCTION public.f(uuid);\n"],
    ["EC-014 ADD NOT NULL w/o default", "ALTER TABLE public.t ADD COLUMN c text NOT NULL;\n"],
    ["EC-015 SET NOT NULL (bare)", "ALTER TABLE public.t ALTER COLUMN c SET NOT NULL;\n"],
    ["EC-016 ALTER COLUMN TYPE (multi-line)", "ALTER TABLE public.t\n  ALTER COLUMN c TYPE bigint;\n"],
    ["EC-017 ADD FK without NOT VALID", "ALTER TABLE public.t ADD CONSTRAINT fk FOREIGN KEY (x) REFERENCES public.u(id);\n"],
    ["EC-018 ADD CHECK without NOT VALID", "ALTER TABLE public.t ADD CONSTRAINT ck CHECK (c > 0);\n"],
    ["EC-019 CREATE INDEX non-concurrent", "CREATE INDEX idx ON public.t (c);\n"],
  ])("%s FLAGS (1) un-annotated", (_label, sql) => {
    expect(run({ "20260101000000_m.sql": sql })).toBe(1);
  });

  // --- forms that are genuinely safe must stay GREEN (0), so the guard isn't just noise. ---
  it.each([
    ["EC-020 NOT NULL WITH default", "ALTER TABLE public.t ADD COLUMN c text NOT NULL DEFAULT '';\n"],
    ["EC-021 FK NOT VALID", "ALTER TABLE public.t ADD CONSTRAINT fk FOREIGN KEY (x) REFERENCES public.u(id) NOT VALID;\n"],
    ["EC-022 CREATE INDEX CONCURRENTLY", "CREATE INDEX CONCURRENTLY idx ON public.t (c);\n"],
    ["EC-023 index on a NEW table (same migration)", "CREATE TABLE public.t (id uuid);\nCREATE INDEX idx ON public.t (id);\n"],
    ["EC-024 FK on a NEW table (same migration)", "CREATE TABLE public.t (id uuid);\nALTER TABLE public.t ADD CONSTRAINT fk FOREIGN KEY (x) REFERENCES public.u(id);\n"],
  ])("%s ALLOWS (0)", (_label, sql) => {
    expect(run({ "20260101000000_m.sql": sql })).toBe(0);
  });

  it("EC-025: a one-rule-scoped annotation ALLOWS (0) just that rule", () => {
    expect(
      run({
        "20260101000000_m.sql":
          "-- expand-contract-ok=index-not-concurrent: tiny table, off-hours\nCREATE INDEX idx ON public.t (c);\n",
      })
    ).toBe(0);
  });

  it("EC-026: annotation is PER-STATEMENT — it does not cover a second destructive statement", () => {
    expect(
      run({
        "20260101000000_m.sql":
          "-- expand-contract-ok: dropping old_c is safe\nALTER TABLE public.t DROP COLUMN old_c;\nDROP TABLE public.other;\n",
      })
    ).toBe(1);
  });

  it("EC-027: an annotation with no reason does NOT suppress (unexplained waiver is not a waiver)", () => {
    expect(run({ "20260101000000_m.sql": "-- expand-contract-ok:\n" + DROP })).toBe(1);
  });

  it("EC-028: FLAGS (1) a grandfather entry that no longer violates (shrink-only prune)", () => {
    expect(run({ "legacy.sql": ADDITIVE }, ["legacy.sql"])).toBe(1);
  });

  // --- F-1 (re-audit): COLUMN is OPTIONAL in Postgres — the short forms must RED too, and the safe
  // DROP sub-clauses must NOT over-flag. These are the holes the first guard version missed. ---
  it.each([
    ["EC-029 DROP col (no COLUMN kw)", "ALTER TABLE public.t DROP old_c;\n"],
    ["EC-030 DROP IF EXISTS col (no COLUMN kw)", "ALTER TABLE public.t DROP IF EXISTS old_c;\n"],
    ["EC-031 RENAME col (no COLUMN kw)", "ALTER TABLE public.t RENAME a TO b;\n"],
    ["EC-032 ALTER col TYPE (no COLUMN kw)", "ALTER TABLE public.t ALTER c TYPE bigint;\n"],
  ])("%s FLAGS (1)", (_label, sql) => {
    expect(run({ "20260101000000_m.sql": sql })).toBe(1);
  });

  it.each([
    ["EC-033 DROP DEFAULT", "ALTER TABLE public.t ALTER COLUMN c DROP DEFAULT;\n"],
    ["EC-034 DROP NOT NULL (relaxing is safe)", "ALTER TABLE public.t ALTER COLUMN c DROP NOT NULL;\n"],
    ["EC-035 DROP CONSTRAINT", "ALTER TABLE public.t DROP CONSTRAINT fk;\n"],
  ])("%s ALLOWS (0) — not a column removal", (_label, sql) => {
    expect(run({ "20260101000000_m.sql": sql })).toBe(0);
  });

  // --- F-2 (re-audit): the new-table exception must not be poisoned by a CREATE TABLE in a string
  // literal, nor by a same-name table in a DIFFERENT schema. ---
  it("EC-036: a CREATE TABLE inside a string literal does NOT auto-allow an index on a live table", () => {
    expect(
      run({
        "20260101000000_m.sql":
          "INSERT INTO public.log(msg) VALUES ('CREATE TABLE public.t note');\nCREATE INDEX idx ON public.t (c);\n",
      })
    ).toBe(1);
  });

  it("EC-037: an index on public.t is NOT auto-allowed by creating audit.t (cross-schema)", () => {
    expect(
      run({ "20260101000000_m.sql": "CREATE TABLE audit.t (id uuid);\nCREATE INDEX idx ON public.t (c);\n" })
    ).toBe(1);
  });

  it("EC-038: an index on the SAME table referenced unqualified is still allowed (public default)", () => {
    expect(
      run({ "20260101000000_m.sql": "CREATE TABLE public.t (id uuid);\nCREATE INDEX idx ON t (id);\n" })
    ).toBe(0);
  });

  // --- F-3 (re-audit): shrink-only is mechanical — a migration dated on/after the widening cutoff
  // (20261110) may NOT be grandfathered; it must annotate. A pre-cutoff file still may. ---
  it("EC-039: FLAGS (1) a grandfather entry dated on/after the cutoff (no new violator via the allowlist)", () => {
    expect(run({ "20261201_new.sql": DROP }, ["20261201_new.sql"])).toBe(1);
  });

  it("EC-040: ALLOWS (0) a pre-cutoff grandfather entry", () => {
    expect(run({ "20260101_old.sql": DROP }, ["20260101_old.sql"])).toBe(0);
  });
});
