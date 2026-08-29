// Smoke coverage for scripts/ci/check-audit-sink-coverage.mjs — the audit-log tri-partite sink
// gate (Part 1 §1.1). Every public-schema table must have an explicit row in
// public.audit_sink_registry; without it a new table can silently double-write into audit_log
// (KPI #1 regresses) or fan out into notifications without dedupe (KPI #11 regresses).
//
// The guard's two inputs — the live public-table list and the registered table_names — normally
// come from psql. To exercise its coverage-diff detection WITHOUT a live DB, it honours a test-only
// seam AUDIT_SINK_FIXTURE (a JSON file { tables, registered }) that stands in for those two
// queries — never set in prod/CI. These tests run the REAL guard and assert exit codes for full
// coverage / an unregistered table / fail-closed-on-empty.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-audit-sink-coverage.mjs");

afterAll(cleanupGuardFixtures);

/** Run the real guard with the given env; return exit code (0 clean/skip, 1 violation/fail-closed). */
function runGuard(env: Record<string, string> = {}): number {
  try {
    execFileSync("node", [GUARD], { stdio: "pipe", env: { ...process.env, ...env } });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

/** Write a { tables, registered } fixture and return its absolute path. */
function fixture(tables: string[], registered: string[]): string {
  const root = guardFixture({ "README.md": "fixture\n" });
  const p = resolve(root, "sink.json");
  writeFileSync(p, JSON.stringify({ tables, registered }));
  return p;
}

describe("check-audit-sink-coverage guard (smoke)", () => {
  it("ASC-001: passes when every public table is registered in audit_sink_registry", () => {
    const p = fixture(["profiles", "orders"], ["profiles", "orders"]);
    expect(runGuard({ AUDIT_SINK_FIXTURE: p })).toBe(0);
  });

  it("ASC-002: FLAGS (exit 1) a public table with no audit_sink_registry row", () => {
    const p = fixture(["profiles", "orders"], ["profiles"]);
    expect(runGuard({ AUDIT_SINK_FIXTURE: p })).toBe(1);
  });

  it("ASC-003: fails CLOSED (exit 1) when discovery yields zero tables (broken connection, not clean)", () => {
    const p = fixture([], ["profiles"]);
    expect(runGuard({ AUDIT_SINK_FIXTURE: p })).toBe(1);
  });

  it("ASC-004: the real guard self-heals to a skip (exit 0) without psql/PGHOST", () => {
    // No fixture, no PGHOST → transparent env-gated skip, never a false green.
    const env = { ...process.env } as Record<string, string>;
    delete env.PGHOST;
    delete env.AUDIT_SINK_FIXTURE;
    try {
      execFileSync("node", [GUARD], { stdio: "pipe", env });
      expect(true).toBe(true);
    } catch (e) {
      // Only acceptable failure is if a real psql+PGHOST is present in this env and finds drift;
      // in the sandbox there is none, so a throw here is a genuine regression.
      expect((e as { status?: number }).status).toBeUndefined();
    }
  });
});
