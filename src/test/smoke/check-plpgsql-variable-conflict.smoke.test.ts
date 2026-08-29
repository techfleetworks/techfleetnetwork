// Smoke coverage for scripts/ci/check-plpgsql-variable-conflict.mjs — a guard that fails CI when
// a plpgsql function in supabase/migrations declares `RETURNS TABLE (...)` without
// `#variable_conflict use_column` in its body. Postgres OUT-parameter (column) names shadow
// column references, raising `column reference "X" is ambiguous` at CALL time — the
// get_refactor_kpis incident (2026-06-04). The guard only enforces migrations whose filename
// timestamp is AFTER BASELINE_CUTOFF (20260604170800); older migrations are grandfathered
// immutable history. Escape hatch: `-- @safe-variable-conflict` on the line immediately before
// the CREATE. These tests prove the guard flags a real missing-directive function, respects the
// cutoff and the escape hatch, and fails closed — run the real guard against .sql fixtures.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-plpgsql-variable-conflict.mjs");

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

// A RETURNS TABLE plpgsql function body with vs. without the required directive.
const WITH_DIRECTIVE =
  "CREATE OR REPLACE FUNCTION public.get_kpis()\n" +
  "RETURNS TABLE (total bigint, active bigint)\n" +
  "LANGUAGE plpgsql\n" +
  "AS $$\n" +
  "#variable_conflict use_column\n" +
  "BEGIN\n" +
  "  RETURN QUERY SELECT count(*)::bigint, count(*)::bigint FROM users;\n" +
  "END;\n" +
  "$$;\n";

const MISSING_DIRECTIVE =
  "CREATE OR REPLACE FUNCTION public.get_refactor_kpis()\n" +
  "RETURNS TABLE (total bigint, active bigint)\n" +
  "LANGUAGE plpgsql\n" +
  "AS $$\n" +
  "BEGIN\n" +
  "  RETURN QUERY SELECT count(*)::bigint, count(*)::bigint FROM refactors;\n" +
  "END;\n" +
  "$$;\n";

describe("check-plpgsql-variable-conflict guard (smoke)", () => {
  it("PLPG-001: passes a post-cutoff RETURNS TABLE fn that declares the directive", () => {
    const r = guardFixture({ "supabase/migrations/20260901000000_kpis.sql": WITH_DIRECTIVE });
    expect(runGuard(r)).toBe(0);
  });

  it("PLPG-002: FLAGS a post-cutoff RETURNS TABLE plpgsql fn missing the directive", () => {
    const r = guardFixture({
      "supabase/migrations/20260901000000_refactor.sql": MISSING_DIRECTIVE,
    });
    expect(runGuard(r)).toBe(1);
  });

  it("PLPG-003: honors the -- @safe-variable-conflict escape hatch on the line before CREATE", () => {
    const r = guardFixture({
      "supabase/migrations/20260901000000_safe.sql":
        "-- @safe-variable-conflict\n" + MISSING_DIRECTIVE,
    });
    expect(runGuard(r)).toBe(0);
  });

  it("PLPG-004: does NOT flag the same violation in a pre-cutoff (grandfathered) migration", () => {
    // Identical missing-directive body, but a filename stamp on/before BASELINE_CUTOFF is
    // immutable history — the guard must skip it. Proves the cutoff logic is live.
    const r = guardFixture({ "supabase/migrations/20260101000000_old.sql": MISSING_DIRECTIVE });
    expect(runGuard(r)).toBe(0);
  });

  it("PLPG-005: fails CLOSED (exit 2) when supabase/migrations is missing", () => {
    const r = guardFixture({ "README.md": "no migrations dir here" });
    expect(runGuard(r)).toBe(2);
  });

  it("PLPG-006: fails CLOSED (exit 1) when the root exists but holds zero .sql files", () => {
    const r = guardFixture({ "supabase/migrations/README.md": "no sql here" });
    expect(runGuard(r)).toBe(1);
  });

  it("PLPG-007: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
