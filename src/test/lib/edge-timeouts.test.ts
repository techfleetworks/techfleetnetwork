import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { EDGE_FUNCTION_TIMEOUTS_MS, resolveEdgeTimeoutMs } from "@/lib/edge/edge-timeouts";

const DEFAULT = 8_000;

describe("resolveEdgeTimeoutMs — precedence (explicit → registry → default)", () => {
  it("an explicit per-call timeout always wins, registered or not", () => {
    expect(resolveEdgeTimeoutMs("gumroad-backfill", 5_000, DEFAULT)).toBe(5_000);
    expect(resolveEdgeTimeoutMs("unregistered-fn", 5_000, DEFAULT)).toBe(5_000);
  });

  it("a registered function uses its registry budget when no explicit timeout is given", () => {
    expect(resolveEdgeTimeoutMs("gumroad-backfill", undefined, DEFAULT)).toBe(
      EDGE_FUNCTION_TIMEOUTS_MS["gumroad-backfill"],
    );
    expect(resolveEdgeTimeoutMs("translate-bundle", undefined, DEFAULT)).toBe(
      EDGE_FUNCTION_TIMEOUTS_MS["translate-bundle"],
    );
  });

  it("an unregistered function falls back to the default", () => {
    expect(resolveEdgeTimeoutMs("some-fast-fn", undefined, DEFAULT)).toBe(DEFAULT);
  });
});

describe("EDGE_FUNCTION_TIMEOUTS_MS — integrity (structurally cannot rot)", () => {
  it("every registered value is a finite ms budget that exceeds the 8s default", () => {
    for (const [fn, ms] of Object.entries(EDGE_FUNCTION_TIMEOUTS_MS)) {
      expect(Number.isFinite(ms), `${fn} timeout must be finite`).toBe(true);
      // A value <= the default is pointless to register and signals confusion.
      expect(ms, `${fn} timeout should exceed the ${DEFAULT}ms default`).toBeGreaterThan(DEFAULT);
    }
  });

  it("every registered function name is a real supabase/functions/<name>/ directory", () => {
    for (const fn of Object.keys(EDGE_FUNCTION_TIMEOUTS_MS)) {
      const dir = join(process.cwd(), "supabase", "functions", fn);
      expect(existsSync(dir), `registry references a missing edge function: ${fn}`).toBe(true);
    }
  });
});
