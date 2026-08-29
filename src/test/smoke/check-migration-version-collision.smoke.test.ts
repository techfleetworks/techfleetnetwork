// Smoke coverage for scripts/ci/check-migration-version-collision.mjs — the MIGRATION-VERSION-001
// guard that fails CI when two files in supabase/migrations/ share a `<version>` prefix (the
// numeric part before the first underscore in `<version>_<name>.sql`). That version is the PRIMARY
// KEY of supabase_migrations.schema_migrations, so a duplicate makes `supabase db push`/`db reset`
// abort with a schema_migrations_pkey unique-constraint violation and breaks the blocking
// migration-smoke gate for everyone. These tests run the REAL guard against fixtures and assert
// exit codes: unique versions pass, a duplicate version fails, a malformed filename fails, and a
// missing supabase/migrations dir fails CLOSED.
//
// The guard reads its dir via the RELATIVE path `supabase/migrations`, i.e. relative to
// process.cwd() — so fixtures steer it purely by running the real guard with cwd = the fixture root.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-migration-version-collision.mjs");

afterAll(cleanupGuardFixtures);

/** Run the real guard with cwd=root; return exit code (0 clean, 1 violation/fail-closed). */
function runGuard(root: string): number {
  try {
    execFileSync("node", [GUARD], { cwd: root, stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("check-migration-version-collision guard (smoke)", () => {
  it("MIG-001: passes a migrations dir with all-unique version prefixes", () => {
    const r = guardFixture({
      "supabase/migrations/20260101120000_init.sql": "select 1;\n",
      "supabase/migrations/20260102120000_add_table.sql": "select 2;\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("MIG-002: FLAGS two migrations that share the same version prefix (the pkey collision)", () => {
    const r = guardFixture({
      "supabase/migrations/20260809161000_discord_link.sql": "select 1;\n",
      "supabase/migrations/20260809161000_other_change.sql": "select 2;\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("MIG-003: FLAGS a filename without the required numeric version prefix (malformed)", () => {
    const r = guardFixture({
      "supabase/migrations/20260101120000_ok.sql": "select 1;\n",
      "supabase/migrations/no_leading_number.sql": "select 2;\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("MIG-004: fails CLOSED (exit 1) when supabase/migrations is missing", () => {
    const r = guardFixture({ "README.md": "no migrations dir here" });
    expect(runGuard(r)).toBe(1);
  });

  it("MIG-005: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
