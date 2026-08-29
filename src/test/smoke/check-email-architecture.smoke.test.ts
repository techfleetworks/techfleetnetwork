// Smoke coverage for scripts/ci/check-email-architecture.mjs — an ARCHITECTURE guard that fails
// CI when the email subsystem v2 layering is violated. It enforces two dependency rules over
// supabase/functions/_shared/email:
//   DOMAIN files (…/domain/…)      MUST NOT reach for infrastructure/providers or do I/O:
//     no `npm:@supabase`, `npm:@lovable.dev`, `npm:@react-email`, no `Deno.`, no `fetch(`.
//   APPLICATION files (…/application/…) MUST NOT import infrastructure directly (only ports):
//     no `from "../infrastructure…"`, no `npm:@supabase`, no `npm:@lovable.dev`.
// These tests prove the guard actually CATCHES each forbidden import/IO in the branch that owns
// it, tolerates a forbidden token that appears only inside a comment, and fails closed — run the
// real guard against fixtures, assert exit codes.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-email-architecture.mjs");

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

describe("check-email-architecture layering guard (smoke)", () => {
  it("EARCH-001: passes clean domain + application code that respects the layering", () => {
    const r = guardFixture({
      "supabase/functions/_shared/email/domain/types.ts": "export type EmailAddress = string;\n",
      "supabase/functions/_shared/email/application/enqueue.ts":
        'import { policyFor } from "../domain/policies.ts";\n',
    });
    expect(runGuard(r)).toBe(0);
  });

  it("EARCH-002: FLAGS a domain file importing npm:@supabase (I/O in domain)", () => {
    const r = guardFixture({
      "supabase/functions/_shared/email/domain/bad.ts":
        'import { createClient } from "npm:@supabase/supabase-js";\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("EARCH-003: FLAGS a domain file importing npm:@lovable.dev (provider in domain)", () => {
    const r = guardFixture({
      "supabase/functions/_shared/email/domain/bad.ts":
        'import x from "npm:@lovable.dev/cloud-auth-js";\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("EARCH-004: FLAGS a domain file importing npm:@react-email (rendering in domain)", () => {
    const r = guardFixture({
      "supabase/functions/_shared/email/domain/bad.ts":
        'import { render } from "npm:@react-email/render";\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("EARCH-005: FLAGS a domain file touching Deno.* (runtime I/O in domain)", () => {
    const r = guardFixture({
      "supabase/functions/_shared/email/domain/bad.ts": 'const key = Deno.env.get("RESEND_KEY");\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("EARCH-006: FLAGS a domain file calling fetch( (network I/O in domain)", () => {
    const r = guardFixture({
      "supabase/functions/_shared/email/domain/bad.ts":
        'const res = await fetch("https://api.resend.com/emails");\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("EARCH-007: FLAGS an application file importing ../infrastructure directly (bypasses ports)", () => {
    const r = guardFixture({
      "supabase/functions/_shared/email/application/bad.ts":
        'import { PgOutboxRepo } from "../infrastructure/pg-outbox-repo.ts";\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("EARCH-008: FLAGS an application file importing npm:@supabase directly", () => {
    const r = guardFixture({
      "supabase/functions/_shared/email/application/bad.ts":
        'import { createClient } from "npm:@supabase/supabase-js";\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("EARCH-009: FLAGS an application file importing npm:@lovable.dev directly", () => {
    const r = guardFixture({
      "supabase/functions/_shared/email/application/bad.ts":
        'import x from "npm:@lovable.dev/cloud-auth-js";\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("EARCH-010: does NOT flag a forbidden import that appears only inside a comment", () => {
    const r = guardFixture({
      "supabase/functions/_shared/email/domain/ok.ts":
        '// import { createClient } from "npm:@supabase/supabase-js";\n' +
        "export const TIER = 0;\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("EARCH-011: fails CLOSED (exit 2) when supabase/functions/_shared/email is missing", () => {
    const r = guardFixture({ "README.md": "no email subsystem here" });
    expect(runGuard(r)).toBe(2);
  });

  it("EARCH-012: fails CLOSED (exit 1) when the email root has zero .ts files to scan", () => {
    const r = guardFixture({ "supabase/functions/_shared/email/README.md": "no ts here" });
    expect(runGuard(r)).toBe(1);
  });

  it("EARCH-013: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
