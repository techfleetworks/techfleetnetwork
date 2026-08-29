// Smoke coverage for scripts/ci/check-no-raw-functions-error-shape.mjs — ERROR-SHAPE-OWNER-001.
// The raw supabase edge-error shape (FunctionsHttpError / `.context.status`) may be inspected ONLY
// in the normalization/classification owner layer; every other consumer must use EdgeInvokeError /
// toError(). This is what makes routing calls through invokeEdge globally safe (ADR-0028): with it
// green, no consumer is coupled to the raw shape, so normalizing the thrown value can't break anyone.
//
// The guard scans `src` relative to cwd (shared _guard.mjs harness), so fixtures steer it by running
// the REAL guard with cwd = the fixture root.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-no-raw-functions-error-shape.mjs");

afterAll(cleanupGuardFixtures);

/** Run the real guard with cwd=root; return exit code (0 clean, 1 violation/zero-scan, 2 fail-closed). */
function runGuard(root: string): number {
  try {
    execFileSync("node", [GUARD], { cwd: root, stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("check-no-raw-functions-error-shape guard (smoke)", () => {
  it("ES-001: passes a consumer that uses the normalized EdgeInvokeError.status", () => {
    const r = guardFixture({
      "src/components/Ok.tsx":
        'import { EdgeInvokeError } from "@/lib/errors/AppError";\n' +
        "export function f(e: unknown) { return e instanceof EdgeInvokeError ? e.status : 0; }\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("ES-002: FLAGS a non-owner file reading a raw error's .context.status", () => {
    const r = guardFixture({
      "src/components/Bad.tsx":
        "export function f(e: unknown) { return (e as { context?: { status?: number } }).context?.status; }\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("ES-003: FLAGS a non-owner file branching on `instanceof FunctionsHttpError`", () => {
    const r = guardFixture({
      "src/pages/Bad.tsx":
        "export function f(e: unknown) { if (e instanceof FunctionsHttpError) return 1; return 0; }\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("ES-004: EXEMPTS the owner layer (src/lib/errors/**) — it may inspect the raw shape", () => {
    const r = guardFixture({
      "src/lib/errors/extract.ts":
        "export function s(e: unknown) { return (e as { context?: { status?: number } }).context?.status; }\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it('ES-007: FLAGS a non-owner file branching on `.name === "FunctionsHttpError"`', () => {
    const r = guardFixture({
      "src/services/x.service.ts":
        'export function f(e: { name?: string }) { return e.name === "FunctionsHttpError"; }\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it('ES-008: FLAGS a non-owner file bracket-accessing a raw error\'s `["context"]`', () => {
    const r = guardFixture({
      "src/services/y.service.ts":
        'export function f(e: Record<string, unknown>) { return (e as any)["context"]; }\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("ES-005: fails CLOSED (exit 2) when there is no src/ to scan", () => {
    expect(runGuard(guardFixture({ "README.md": "no src here" }))).toBe(2);
  });

  it("ES-006: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
