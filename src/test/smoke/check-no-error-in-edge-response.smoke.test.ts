// Smoke coverage for scripts/ci/check-no-error-in-edge-response.mjs — EDGE-ERR-RESP-001.
// The guard flags a caught error's .message/.stack (or String(err)) placed in a jsonResponse/Response
// BODY — the stack-trace-exposure leak (decisions.md §8) — while leaving the safe `errorResponse`
// owner and plain log calls alone. Each scenario writes a throwaway supabase/functions tree under the
// EDGE_ERR_ROOT seam and asserts exit codes: clean→0, leak→1, zero-scan→2. FAILS if the guard stops
// detecting (discrimination, decisions §6).
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-no-error-in-edge-response.mjs");

afterAll(cleanupGuardFixtures);

/** Write one edge function (fn/index.ts = src) under a fixture root; run the guard; return exit code. */
function run(src: string | null, fnName = "fn"): number {
  const root = guardFixture({});
  if (src !== null) {
    const dir = resolve(root, "supabase", "functions", fnName);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "index.ts"), src);
  } else {
    // create an empty functions dir so "zero .ts files" (not "no dir") is exercised by E-009
    mkdirSync(resolve(root, "supabase", "functions"), { recursive: true });
  }
  try {
    execFileSync("node", [GUARD], { stdio: "pipe", env: { ...process.env, EDGE_ERR_ROOT: root } });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("check-no-error-in-edge-response guard (smoke)", () => {
  it("E-001: passes when error goes through the safe errorResponse owner", () => {
    expect(run(`return errorResponse(e, "Failed", 500);\n`)).toBe(0);
  });

  it("E-002: FLAGS jsonResponse({ error: e.message })", () => {
    expect(run(`return jsonResponse({ error: e.message }, 500);\n`)).toBe(1);
  });

  it("E-003: FLAGS new Response(JSON.stringify({ error: err.message }))", () => {
    expect(
      run(`return new Response(JSON.stringify({ error: err.message }), { status: 500 });\n`)
    ).toBe(1);
  });

  it("E-004: FLAGS a .stack in a response body", () => {
    expect(run(`return jsonResponse({ error: error.stack }, 500);\n`)).toBe(1);
  });

  it("E-005: FLAGS String(e) in a response body", () => {
    expect(run(`return jsonResponse({ error: String(e) }, 502);\n`)).toBe(1);
  });

  it("E-006: FLAGS the (err as Error).message shape", () => {
    expect(
      run(`return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });\n`)
    ).toBe(1);
  });

  it("E-007: does NOT flag error.message in a console.error log (not a response)", () => {
    expect(run(`console.error("boom", e.message); return errorResponse(e, "Failed", 500);\n`)).toBe(0);
  });

  it("E-008: does NOT flag a static `message:` key in a response", () => {
    expect(run(`return jsonResponse({ message: "Saved" }, 200);\n`)).toBe(0);
  });

  it("E-009: fails CLOSED (exit 2) when there are zero edge function files", () => {
    expect(run(null)).toBe(2);
  });
});
