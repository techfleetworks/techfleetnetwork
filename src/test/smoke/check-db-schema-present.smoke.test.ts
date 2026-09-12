// Smoke coverage for scripts/ci/check-db-schema-present.mjs — DB-SCHEMA-PRESENT-001 (ADR-0036).
// The gate derives the schema objects the committed migrations DECLARE (tables, extensions, types,
// views, constraints, rls-enabled) and asserts each EXISTS in prod (via the Management API), because
// TechFleet's post-Lovable prod has no supabase_migrations ledger. These scenarios drive the REAL
// guard against throwaway migration dirs + a prod-objects fixture via the DB_SCHEMA_ROOT /
// DB_SCHEMA_PROD_FIXTURE seams, asserting exit codes for both the happy path and — crucially — every
// FAIL-CLOSED path the ADR-0036 correctness audit hardened: allowlist-present, allowlist-dead-key,
// empty %I sidecar, zero-derived, and a test seam leaking into CI. The corpus baseline is skipped
// under DB_SCHEMA_ROOT (fixtures are intentionally tiny), so these test the diff + fail-closed logic.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-db-schema-present.mjs");

afterAll(cleanupGuardFixtures);

type ProdRow = { kind: string; identifier: string };
type RunOpts = {
  allowlist?: Record<string, unknown>;
  sidecar?: Record<string, unknown>;
  env?: Record<string, string>;
  allowSeams?: boolean; // default true — the CI seam-guard opt-in the smoke test legitimately holds
};

/**
 * Run the guard against a throwaway repo (migrations + optional allowlist/sidecar) and a prod-objects
 * fixture. `prod === null` omits the fixture so the no-token fail-closed path is exercised.
 */
function run(
  migrations: Record<string, string>,
  prod: ProdRow[] | null,
  opts: RunOpts = {}
): number {
  const fixtureFiles: Record<string, string> = { "readme.md": "x", ...migrations };
  if (opts.allowlist)
    fixtureFiles["scripts/ci/db-schema-allowlist.json"] = JSON.stringify(opts.allowlist);
  if (opts.sidecar)
    fixtureFiles["scripts/ci/db-dynamic-objects.json"] = JSON.stringify({ objects: opts.sidecar });
  const root = guardFixture(fixtureFiles);
  const env: Record<string, string> = { ...process.env, DB_SCHEMA_ROOT: root };
  delete env.SUPABASE_ACCESS_TOKEN; // ensure the no-token path is genuinely tokenless
  if (opts.allowSeams !== false) env.DB_SCHEMA_ALLOW_SEAMS = "1";
  if (prod !== null) {
    const p = resolve(root, "prod.json");
    writeFileSync(p, JSON.stringify(prod));
    env.DB_SCHEMA_PROD_FIXTURE = p;
  }
  Object.assign(env, opts.env ?? {});
  try {
    execFileSync("node", [GUARD], { stdio: "pipe", env });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const MIG_ORDERS = {
  "supabase/migrations/20260101000000_x.sql": "create table if not exists public.orders (id uuid);",
};
// A declared `create table orders (id uuid)` now derives a table AND its column, so prod fixtures list both.
const PROD_ORDERS: ProdRow[] = [
  { kind: "table", identifier: "orders" },
  { kind: "column", identifier: "public.orders.id" },
];

describe("check-db-schema-present guard (smoke)", () => {
  it("DSP-001: passes when the declared table exists in prod", () => {
    expect(run(MIG_ORDERS, PROD_ORDERS)).toBe(0);
  });

  it("DSP-002: FLAGS (exit 1) when a declared table is MISSING from prod (the drift/outage class)", () => {
    expect(run(MIG_ORDERS, [{ kind: "table", identifier: "something_else" }])).toBe(1);
  });

  it("DSP-003: fails CLOSED (exit 2) with no token and no fixture — a guard that can't verify must fail", () => {
    expect(run(MIG_ORDERS, null)).toBe(2);
  });

  it("DSP-004: fails CLOSED (exit 2) when the migrations dir is absent", () => {
    expect(run({}, [])).toBe(2);
  });

  it("DSP-005: fails CLOSED (exit 2) when 0 objects are derived (only a backfill — the vacuous-green class)", () => {
    expect(
      run({ "supabase/migrations/20260101000000_x.sql": "update public.orders set n = 1;" }, [])
    ).toBe(2);
  });

  it("DSP-006: allowlisting a genuinely-absent object passes WITHOUT emptying the derived set", () => {
    // Two tables: `legacy` was dropped out of band (allowlisted, absent from prod); `orders` must
    // still exist. Derived set stays non-empty, so this is real allowlisting, not the zero-derived path.
    const mig = {
      "supabase/migrations/20260101000000_x.sql":
        "create table if not exists public.orders (id uuid); create table if not exists public.legacy (id uuid);",
    };
    expect(run(mig, PROD_ORDERS, { allowlist: { table: ["legacy"] } })).toBe(0);
  });

  it("DSP-007: fails CLOSED (exit 2) when an allowlisted object is actually PRESENT in prod (stale waiver masking a real object)", () => {
    // The one fail-OPEN path the audit found, now closed: a waiver may only cover an ABSENT object.
    const mig = {
      "supabase/migrations/20260101000000_x.sql":
        "create table if not exists public.orders (id uuid); create table if not exists public.legacy (id uuid);",
    };
    const prodBoth: ProdRow[] = [
      { kind: "table", identifier: "orders" },
      { kind: "table", identifier: "legacy" },
    ];
    expect(run(mig, prodBoth, { allowlist: { table: ["legacy"] } })).toBe(2);
  });

  it("DSP-008: fails CLOSED (exit 2) when an allowlist key names an inactive/deferred category (dead waiver)", () => {
    expect(run(MIG_ORDERS, PROD_ORDERS, { allowlist: { cron_job: ["x"] } })).toBe(2);
  });

  it("DSP-009: fails CLOSED (exit 2) when a %I dynamic fan-out is registered with an EMPTY sidecar list", () => {
    // Raw text carries a `create table public.%I` fan-out → tripwire flags the file → its sidecar
    // entry must contribute >=1 concrete name; an empty list would inject nothing (a silent miss).
    const file = "supabase/migrations/20260101000000_dyn.sql";
    const mig = {
      [file]:
        "create table if not exists public.orders (id uuid);\nexecute format('create table if not exists public.%I (id uuid)', 'dynt');",
    };
    const key = "table::20260101000000_dyn.sql";
    expect(run(mig, PROD_ORDERS, { sidecar: { [key]: [] } })).toBe(2);
  });

  it("DSP-010: a comma-list `DROP TABLE a, b` subtracts BOTH tables, not just the first", () => {
    // create a,b,c then drop a,b → only c should be expected. If the drop mis-subtracted (only a),
    // `b` would remain declared and be reported MISSING (exit 1). Exit 0 proves both were subtracted.
    const mig = {
      "supabase/migrations/20260101000000_x.sql":
        "create table if not exists public.a (id uuid); create table if not exists public.b (id uuid); create table if not exists public.c (id uuid);",
      "supabase/migrations/20260102000000_drop.sql": "drop table if exists public.a, public.b;",
    };
    expect(
      run(mig, [
        { kind: "table", identifier: "c" },
        { kind: "column", identifier: "public.c.id" },
      ])
    ).toBe(0);
  });

  it("DSP-011: rls_enabled is public-only — an ENABLE RLS on a non-public system table is NOT asserted", () => {
    // realtime.messages is Supabase-managed; asserting its RLS state would be a false positive. Only
    // public.orders is expected. The prod fixture omits realtime.messages entirely.
    const mig = {
      "supabase/migrations/20260101000000_x.sql":
        "create table if not exists public.orders (id uuid); alter table realtime.messages enable row level security; alter table public.orders enable row level security;",
    };
    const prod: ProdRow[] = [
      { kind: "table", identifier: "orders" },
      { kind: "column", identifier: "public.orders.id" },
      { kind: "rls_enabled", identifier: "public.orders" },
    ];
    expect(run(mig, prod)).toBe(0);
  });

  it("DSP-012: refuses test seams in CI without opt-in (exit 2), but honors them WITH the explicit opt-in", () => {
    // Simulate the blocking CI job: CI=true. A leaked DB_SCHEMA_ROOT/PROD_FIXTURE must fail closed so
    // the gate can never pass vacuously in CI; the guard's own smoke run opts in via DB_SCHEMA_ALLOW_SEAMS.
    expect(run(MIG_ORDERS, PROD_ORDERS, { env: { CI: "true" }, allowSeams: false })).toBe(2);
    expect(run(MIG_ORDERS, PROD_ORDERS, { env: { CI: "true" }, allowSeams: true })).toBe(0);
  });

  it("DSP-013: a multi-clause `ALTER TABLE t ADD COLUMN a, ADD COLUMN b` derives BOTH columns, not just the first", () => {
    // Regression pin for the multi-ADD capture bug: the table name appears once; the comma-separated
    // continuation clauses carry no `ALTER TABLE` prefix. Capturing only the first clause left `b`
    // underived — so a committed-but-never-applied `b` would pass GREEN (the silent-drift/outage class
    // this gate exists to stop). Prod here has `a` but NOT `b`, so the gate must FLAG `b` as MISSING
    // (exit 1). Under the bug `b` was never declared → the diff was vacuously clean (exit 0).
    const mig = {
      "supabase/migrations/20260101000000_x.sql":
        "create table if not exists public.orders (id uuid);",
      "supabase/migrations/20260102000000_add.sql":
        "alter table public.orders add column if not exists a int, add column if not exists b int;",
    };
    const withoutB: ProdRow[] = [
      { kind: "table", identifier: "orders" },
      { kind: "column", identifier: "public.orders.id" },
      { kind: "column", identifier: "public.orders.a" },
    ];
    expect(run(mig, withoutB)).toBe(1); // b is derived and absent from prod → flagged
    // And when BOTH land in prod, the same declaration passes — no phantom column from the multi-clause parse.
    expect(run(mig, [...withoutB, { kind: "column", identifier: "public.orders.b" }])).toBe(0);
  });

  it("DSP-014: keyword-less `ALTER TABLE t ADD col type` (no COLUMN, no trailing ;) is derived; ADD CONSTRAINT is not", () => {
    // Postgres accepts ADD without the COLUMN keyword and a final statement with no ';'. A never-applied
    // such column must still be caught (a false negative here = the outage class). And `ADD CONSTRAINT c …`
    // must NOT be mis-read as a column named `c`/`constraint`.
    const mig = {
      "supabase/migrations/20260101000000_x.sql":
        "create table if not exists public.orders (id uuid);",
      "supabase/migrations/20260102000000_add.sql":
        "alter table public.orders add constraint orders_id_present check (id is not null);\n" +
        "alter table public.orders add note text", // keyword-less ADD, no trailing semicolon (EOF)
    };
    const prod: ProdRow[] = [
      { kind: "table", identifier: "orders" },
      { kind: "column", identifier: "public.orders.id" },
      { kind: "constraint", identifier: "orders.orders_id_present" },
      { kind: "column", identifier: "public.orders.note" },
    ];
    // Exit 0 requires ALL declared present: proves `note` (keyword-less) IS derived AND that the
    // constraint was NOT mis-derived as a phantom column (there is no such column row in prod).
    expect(run(mig, prod)).toBe(0);
    // Drop `note` → the keyword-less column is flagged, proving its derivation is real, not vacuous.
    expect(
      run(
        mig,
        prod.filter((r) => r.identifier !== "public.orders.note")
      )
    ).toBe(1);
  });
});
