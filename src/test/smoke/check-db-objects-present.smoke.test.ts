// Smoke coverage for scripts/ci/check-db-objects-present.mjs — DB-OBJECTS-PRESENT-001 (ADR-0034).
// The gate derives the tables/functions the committed migrations DECLARE and asserts each exists in
// prod (via the Management API). It replaces the ledger-based check-migrations-applied, which was
// blind because TechFleet's post-Lovable prod has no supabase_migrations.schema_migrations ledger.
// These scenarios drive the real guard against throwaway migration dirs + a prod-objects fixture via
// the DB_OBJECTS_ROOT / DB_OBJECTS_PROD_FIXTURE seams, and assert exit codes: declared+present → 0,
// declared+absent → 1, allowlisted → 0, and fail-closed (no token / missing migrations) → 2.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-db-objects-present.mjs");

afterAll(cleanupGuardFixtures);

type ProdObj = { kind: "table" | "function"; name: string };

/**
 * Run the guard against a throwaway repo (migrations + optional allowlist) and a prod-objects
 * fixture. `prod === null` omits the fixture so the no-token fail-closed path is exercised.
 */
function run(
  migrations: Record<string, string>,
  prod: ProdObj[] | null,
  allowlist?: { tables?: string[]; functions?: string[] }
): number {
  const fixtureFiles: Record<string, string> = { "readme.md": "x", ...migrations };
  if (allowlist) fixtureFiles["scripts/ci/db-objects-allowlist.json"] = JSON.stringify(allowlist);
  const root = guardFixture(fixtureFiles);
  const env: Record<string, string> = { ...process.env, DB_OBJECTS_ROOT: root };
  delete env.SUPABASE_ACCESS_TOKEN; // ensure the no-token path is genuinely tokenless
  if (prod !== null) {
    const p = resolve(root, "prod.json");
    writeFileSync(p, JSON.stringify(prod));
    env.DB_OBJECTS_PROD_FIXTURE = p;
  }
  try {
    execFileSync("node", [GUARD], { stdio: "pipe", env });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const MIG = {
  "supabase/migrations/001_x.sql": "create table if not exists public.orders (id uuid);",
};

describe("check-db-objects-present guard (smoke)", () => {
  it("DBO-001: passes when the declared table exists in prod", () => {
    expect(run(MIG, [{ kind: "table", name: "orders" }])).toBe(0);
  });

  it("DBO-002: FLAGS (exit 1) when a declared table is MISSING from prod (the drift/outage class)", () => {
    expect(run(MIG, [{ kind: "table", name: "something_else" }])).toBe(1);
  });

  it("DBO-003: allowlisting a missing object passes WITHOUT emptying the derived set (others still checked)", () => {
    // Two declared tables: `legacy_orders` was dropped out of band (allowlisted), while `orders`
    // must still exist in prod. The derived set stays non-empty, so this exercises allowlisting
    // without tripping the zero-derived-object fail-closed (see DBO-007).
    const mig = {
      "supabase/migrations/001_x.sql":
        "create table if not exists public.orders (id uuid); create table if not exists public.legacy_orders (id uuid);",
    };
    expect(run(mig, [{ kind: "table", name: "orders" }], { tables: ["legacy_orders"] })).toBe(0);
  });

  it("DBO-004: counts a declared function too, and flags it when absent", () => {
    const mig = {
      "supabase/migrations/002_fn.sql":
        "create or replace function public.do_thing() returns void language sql as $$ select 1 $$;",
    };
    expect(run(mig, [])).toBe(1);
    expect(run(mig, [{ kind: "function", name: "do_thing" }])).toBe(0);
  });

  it("DBO-005: fails CLOSED (exit 2) with no token and no fixture — a guard that can't verify must fail", () => {
    expect(run(MIG, null)).toBe(2);
  });

  it("DBO-006: fails CLOSED (exit 2) when the migrations dir is absent", () => {
    // fixture with no supabase/migrations dir → readdir throws → fail closed
    expect(run({}, [])).toBe(2);
  });

  it("DBO-007: fails CLOSED (exit 2) when the derived object set is EMPTY (derivation regressed / all allowlisted)", () => {
    // Migration files exist but CREATE nothing (only a backfill) → 0 derived objects. Without the
    // zero-derived tripwire the guard would print "all 0 declared … exist" and pass GREEN — the
    // exact vacuous false-green it replaces. It must fail closed instead.
    expect(run({ "supabase/migrations/001_x.sql": "update public.orders set n = 1;" }, [])).toBe(2);
    // Declaring one table then allowlisting it away also empties the set → same fail-closed.
    expect(run(MIG, [], { tables: ["orders"] })).toBe(2);
  });
});
