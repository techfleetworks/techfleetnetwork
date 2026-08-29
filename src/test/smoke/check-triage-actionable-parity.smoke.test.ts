// Smoke coverage for scripts/ci/check-triage-actionable-parity.mjs — the TRIAGE-ROOT-005 guard
// that keeps the TS `NON_ACTIONABLE_EVENT_TYPES` set (src/services/error-reporter.service.ts) a
// SUBSET of the DB `v_non_actionable` array in the newest migration touching
// is_actionable_event_type. If a TS entry is missing from the DB list, an event the client
// treats as non-actionable could still be inserted into agent_fix_queue by another writer —
// the guard fails CI (exit 1) so the two lists never drift.
//
// ROOT is `resolve(dirname(fileURLToPath(import.meta.url)), "../..")`, so cwd cannot steer it.
// We COPY the guard into a fixture at <root>/scripts/ci/ and run the COPY: from there ROOT =
// <root>, so it reads <root>/src/services/error-reporter.service.ts and
// <root>/supabase/migrations/*.sql. We craft those two files to reproduce each real outcome:
// subset → 0, TS-not-a-subset → 1, and the guard's own fail-closed exit(2) paths.
//
// The real-repo pass runs the REAL guard via a resolved `const GUARD` binding, which is what
// makes check-guard-has-test credit this guard as tested.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-triage-actionable-parity.mjs");
const GUARD_SRC = readFileSync(GUARD, "utf8");

afterAll(cleanupGuardFixtures);

/** A minimal error-reporter.service.ts whose NON_ACTIONABLE_EVENT_TYPES set is `entries`. */
const tsReporter = (entries: string[]) =>
  `const NON_ACTIONABLE_EVENT_TYPES: ReadonlySet<string> = new Set([\n` +
  entries.map((e) => `  "${e}",`).join("\n") +
  `\n]);\nexport {};\n`;

/** A minimal migration defining is_actionable_event_type with v_non_actionable = `entries`. */
const sqlMigration = (entries: string[]) =>
  `CREATE OR REPLACE FUNCTION public.is_actionable_event_type(p_event_type text)\n` +
  `RETURNS boolean LANGUAGE plpgsql AS $$\n` +
  `DECLARE\n  v_non_actionable CONSTANT text[] := ARRAY[\n    ` +
  entries.map((e) => `'${e}'`).join(",") +
  `\n  ];\nBEGIN\n  RETURN NOT (p_event_type = ANY(v_non_actionable));\nEND;\n$$;\n`;

/** Run the COPIED guard in the fixture; return exit code (0 clean, 1 drift, 2 fail-closed). */
function runCopiedGuard(root: string): number {
  try {
    execFileSync("node", [join(root, "scripts/ci/check-triage-actionable-parity.mjs")], {
      stdio: "pipe",
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

/** Run the REAL guard (resolved const → credited by check-guard-has-test); return exit code. */
function runRealGuard(): number {
  try {
    execFileSync("node", [GUARD], { stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("check-triage-actionable-parity guard (smoke)", () => {
  it("TAP-001: passes when the TS set is a subset of the DB v_non_actionable array", () => {
    const r = guardFixture({
      "scripts/ci/check-triage-actionable-parity.mjs": GUARD_SRC,
      "src/services/error-reporter.service.ts": tsReporter(["infra_transient", "email_dlq"]),
      // DB list is a strict superset — every TS entry is covered.
      "supabase/migrations/20260101120000_parity.sql": sqlMigration([
        "infra_transient",
        "email_dlq",
        "validation_rejected",
      ]),
    });
    expect(runCopiedGuard(r)).toBe(0);
  });

  it("TAP-002: FLAGS drift when a TS entry is missing from the DB list (exit 1)", () => {
    const r = guardFixture({
      "scripts/ci/check-triage-actionable-parity.mjs": GUARD_SRC,
      // `edge_invoke_failed` is treated non-actionable in TS but absent from the DB array,
      // so the DB would still let it reach agent_fix_queue — real drift the guard must catch.
      "src/services/error-reporter.service.ts": tsReporter([
        "infra_transient",
        "edge_invoke_failed",
      ]),
      "supabase/migrations/20260101120000_parity.sql": sqlMigration(["infra_transient"]),
    });
    expect(runCopiedGuard(r)).toBe(1);
  });

  it("TAP-003: fails CLOSED (exit 2) when NON_ACTIONABLE_EVENT_TYPES is not found in the TS file", () => {
    const r = guardFixture({
      "scripts/ci/check-triage-actionable-parity.mjs": GUARD_SRC,
      "src/services/error-reporter.service.ts": "export const unrelated = 1;\n",
      "supabase/migrations/20260101120000_parity.sql": sqlMigration(["infra_transient"]),
    });
    expect(runCopiedGuard(r)).toBe(2);
  });

  it("TAP-004: fails CLOSED (exit 2) when no migration defines is_actionable_event_type", () => {
    const r = guardFixture({
      "scripts/ci/check-triage-actionable-parity.mjs": GUARD_SRC,
      "src/services/error-reporter.service.ts": tsReporter(["infra_transient"]),
      // A migration exists but does not touch is_actionable_event_type → guard finds no DB list.
      "supabase/migrations/20260101120000_unrelated.sql": "SELECT 1;\n",
    });
    expect(runCopiedGuard(r)).toBe(2);
  });

  it("TAP-005: the real repo passes the guard", () => {
    expect(runRealGuard()).toBe(0);
  });
});
