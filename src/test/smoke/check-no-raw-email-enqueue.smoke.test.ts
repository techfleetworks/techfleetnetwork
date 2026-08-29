// Smoke coverage for scripts/ci/check-no-raw-email-enqueue.mjs — a BLOCKING guard that fails CI
// when any edge function calls the RETIRED raw `enqueue_email` RPC. That raw pgmq path had its
// consumer removed at the July v2 cutover, so anything enqueued there is silently stranded — every
// enqueue must go through the v2 outbox (`enqueue_email_v2` / the shared v2 helpers). The guard
// scans supabase/functions/**/*.ts (ALL .ts, tests included) for `rpc("enqueue_email")`.
// These tests prove the guard CATCHES the raw call (both quote styles / inner whitespace the
// regex allows), does NOT over-match the still-valid `enqueue_email_v2`, and fails closed — run
// the real guard against fixtures, assert exit codes.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-no-raw-email-enqueue.mjs");

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

describe("check-no-raw-email-enqueue guard (smoke)", () => {
  it("RAWENQ-001: passes an edge fn that enqueues via the v2 outbox (enqueue_email_v2)", () => {
    const r = guardFixture({
      "supabase/functions/send-interview-invite/index.ts":
        'await supabase.rpc("enqueue_email_v2", { to: applicant.email });\n',
    });
    expect(runGuard(r)).toBe(0);
  });

  it("RAWENQ-002: FLAGS a call to the retired raw enqueue_email RPC (double quotes)", () => {
    const r = guardFixture({
      "supabase/functions/send-interview-invite/index.ts":
        'await supabase.rpc("enqueue_email", { to: applicant.email });\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("RAWENQ-003: FLAGS the raw call with single quotes and inner whitespace (regex tolerance)", () => {
    const r = guardFixture({
      "supabase/functions/send-status-update/index.ts":
        "await supabase.rpc( 'enqueue_email' , { to: member.email });\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("RAWENQ-004: fails CLOSED (exit 2) when supabase/functions is missing", () => {
    const r = guardFixture({ "README.md": "no functions here" });
    expect(runGuard(r)).toBe(2);
  });

  it("RAWENQ-005: fails CLOSED (exit 1) when the root has zero .ts files to scan", () => {
    const r = guardFixture({ "supabase/functions/readme.md": "no ts here" });
    expect(runGuard(r)).toBe(1);
  });

  it("RAWENQ-006: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
