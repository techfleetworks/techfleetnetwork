// Smoke coverage for scripts/ci/check-erasure-completeness.mjs — ERASURE-COMPLETENESS-001 (ADR-0039).
// Right-to-erasure completeness: the WINNING handle_user_deletion() (the last migration to redefine
// it) must erase/de-identify every registered PII table. This is the guard that makes the h9/
// handoff_dsar clobber (a later redefinition silently dropping a back-dated migration's tables)
// impossible to ship. The guard resolves paths from its own location, so we COPY it into a throwaway
// fixture repo and run the copy against synthetic migrations; the real guard is exec'd once (EC-006)
// so check-guard-has-test credits it and we prove the real corpus is complete.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-erasure-completeness.mjs");
const GUARD_SRC = readFileSync(GUARD, "utf8");

afterAll(cleanupGuardFixtures);

// Mirror of the guard's REQUIRED list (a fixture def must name all of these to pass).
const REQUIRED = [
  "gumroad_sales",
  "cookie_consents",
  "support_provisioning_log",
  "support_ticket_events",
  "handoff_deliverable_submissions",
  "profiles",
  "user_roles",
  "notifications",
  "chat_conversations",
  "journey_progress",
  "project_applications",
  "general_applications",
];

// A minimal handle_user_deletion definition touching exactly `tables`.
function defSql(tables: string[]): string {
  const body = tables.map((t) => `  DELETE FROM public.${t} WHERE user_id = OLD.id;`).join("\n");
  return (
    `CREATE OR REPLACE FUNCTION public.handle_user_deletion()\n` +
    `RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$\nBEGIN\n${body}\n  RETURN OLD;\nEND;\n$function$;\n`
  );
}

function runCopy(root: string): number {
  try {
    execFileSync("node", [resolve(root, "scripts/ci/check-erasure-completeness.mjs")], {
      stdio: "pipe",
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const BASE = { "scripts/ci/check-erasure-completeness.mjs": GUARD_SRC, "readme.md": "x" };
const mig = (name: string, sql: string) => ({ [`supabase/migrations/${name}`]: sql });

describe("check-erasure-completeness (smoke)", () => {
  it("EC-001: passes when the winning definition covers every required PII table", () => {
    expect(
      runCopy(guardFixture({ ...BASE, ...mig("20260101000000_erase.sql", defSql(REQUIRED)) }))
    ).toBe(0);
  });

  it("EC-002: FLAGS (exit 1) when the definition omits a required table (the erasure gap)", () => {
    const partial = defSql(REQUIRED.filter((t) => t !== "support_ticket_events"));
    expect(runCopy(guardFixture({ ...BASE, ...mig("20260101000000_erase.sql", partial) }))).toBe(1);
  });

  it("EC-003: uses the LAST definition — a later redefinition that drops a table is caught (the clobber)", () => {
    const r = guardFixture({
      ...BASE,
      ...mig("20260101000000_complete.sql", defSql(REQUIRED)),
      ...mig("20260202000000_clobber.sql", defSql(REQUIRED.filter((t) => t !== "cookie_consents"))),
    });
    expect(runCopy(r)).toBe(1); // the winner (clobber) drops cookie_consents
  });

  it("EC-004: fails CLOSED (exit 2) when no migration defines handle_user_deletion", () => {
    expect(
      runCopy(
        guardFixture({
          ...BASE,
          ...mig("20260101000000_x.sql", "create table public.orders (id uuid);"),
        })
      )
    ).toBe(2);
  });

  it("EC-005: fails CLOSED (exit 2) when there is no migrations dir", () => {
    expect(runCopy(guardFixture({ ...BASE }))).toBe(2);
  });

  it("EC-006: the real repo's winning handle_user_deletion covers all registered PII tables", () => {
    try {
      execFileSync("node", [GUARD], { cwd: REPO, stdio: "pipe" });
      expect(true).toBe(true);
    } catch (e) {
      throw new Error(
        "real-repo check-erasure-completeness failed — an erasure gap exists: " +
          ((e as { stdout?: Buffer }).stdout ?? "")
      );
    }
  });
});
