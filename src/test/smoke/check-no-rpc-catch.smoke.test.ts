// Smoke coverage for scripts/ci/check-no-rpc-catch.mjs — an ERROR-HANDLING guard that fails
// CI when a `.rpc(...)` or `safeRpc(...)` call is followed by `.catch(...)`. The Supabase JS
// PostgrestFilterBuilder returned by `.rpc()` is awaitable but NOT a Promise, so `.catch()` on
// it throws "supabase.rpc(...).catch is not a function" at runtime — the RPC error is silently
// swallowed (root cause of the 2026-06-05 outage: 18 `email_failed` rows in `audit_log`).
// These tests prove the guard actually CATCHES both call shapes, honors the escape hatch, and
// fails closed — run the real guard against fixtures, assert exit codes.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-no-rpc-catch.mjs");

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

describe("check-no-rpc-catch error-handling guard (smoke)", () => {
  it("RPC-001: passes clean code that awaits an rpc without chaining .catch()", () => {
    // Both roots must exist or the harness fails closed — seed each with a clean file.
    const r = guardFixture({
      "src/data/kpis.ts":
        "const { data, error } = await supabase.rpc('get_kpis', {});\n" +
        "if (error) throw error;\n",
      "supabase/functions/hello/index.ts": "export const handler = () => new Response('ok');\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("RPC-002: FLAGS a supabase rpc call chained to a catch handler — the swallowed-error outage", () => {
    // Trailing `// rpc-catch-ok:` suppresses only THIS source line (the guard scans its own
    // smoke test); the fixture string written to disk stays pristine and still trips the guard.
    const r = guardFixture({
      "src/data/bad.ts": "await supabase.rpc('send_email', {}).catch(() => null);\n", // rpc-catch-ok: fixture text, not a live call
      "supabase/functions/hello/index.ts": "export const handler = () => new Response('ok');\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("RPC-003: FLAGS the safeRpc-chained-to-catch call shape too", () => {
    const r = guardFixture({
      "supabase/functions/worker/index.ts":
        "const res = safeRpc('do_work', {}).catch((e) => {});\n", // rpc-catch-ok: fixture text, not a live call
      "src/data/ok.ts": "const { data } = await supabase.rpc('get_kpis', {});\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("RPC-004: honors the // rpc-catch-ok: escape hatch on a justified line", () => {
    const r = guardFixture({
      "src/data/legacy.ts":
        "await supabase.rpc('legacy_fn', {}).catch(() => null); // rpc-catch-ok: returns a real Promise\n",
      "supabase/functions/hello/index.ts": "export const handler = () => new Response('ok');\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("RPC-005: fails CLOSED (exit 2) when a scan root is missing", () => {
    // Only src exists — supabase/functions is absent, so the harness must fail closed.
    const r = guardFixture({ "README.md": "no scan roots here" });
    expect(runGuard(r)).toBe(2);
  });

  it("RPC-006: fails CLOSED (exit 1) when roots exist but hold zero .ts files", () => {
    const r = guardFixture({
      "src/README.md": "no ts here",
      "supabase/functions/README.md": "no ts here",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("RPC-007: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
