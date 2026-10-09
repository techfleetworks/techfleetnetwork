import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
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
      EDGE_FUNCTION_TIMEOUTS_MS["gumroad-backfill"]
    );
    expect(resolveEdgeTimeoutMs("translate-bundle", undefined, DEFAULT)).toBe(
      EDGE_FUNCTION_TIMEOUTS_MS["translate-bundle"]
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

// The correctness of every server-side Discord bound (ADR-0063) rests on ONE relationship: each
// function's server-side `totalBudgetMs` ceiling must stay below its registered CLIENT budget, so
// the server finishes before the browser aborts. Those two numbers live apart — a hand-coded const
// in the Deno handler vs. this registry — so nothing but this test links them. Without it, tightening
// a client budget here (e.g. for latency) while leaving the server const untouched would silently
// re-create the Discord-connect outage: server > client → server outruns the browser under a 429
// storm → false "it failed" + orphan work. This pins the invariant the same way
// check-edge-timeout-coverage.mjs pins the sibling one. Fails CLOSED: a missing const errors.
describe("Discord server budgets stay below their client budget (ADR-0063 invariant)", () => {
  // fn -> the name of the OVERALL server-budget constant in supabase/functions/<fn>/index.ts.
  // (backfill also has a per-item cap, but the whole-run ceiling is what must beat the client.)
  const SERVER_BUDGET_CONST: Record<string, string> = {
    "generate-discord-invite": "INVITE_TOTAL_BUDGET_MS",
    "manage-discord-roles": "ROLES_TOTAL_BUDGET_MS",
    "repair-discord-username": "REPAIR_TOTAL_BUDGET_MS",
    "grant-observer-role": "OBSERVER_TOTAL_BUDGET_MS",
    "backfill-discord-usernames": "BACKFILL_TOTAL_BUDGET_MS",
  };
  // The server must finish with room to spare, not merely tie the client. ADR-0063 uses ~3s; require
  // at least a 2s cushion so an accidental near-equal (or inverted) setting fails the gate.
  const MIN_MARGIN_MS = 2_000;

  for (const [fn, constName] of Object.entries(SERVER_BUDGET_CONST)) {
    it(`${fn}: ${constName} < registry client budget (with margin)`, () => {
      const clientBudget = EDGE_FUNCTION_TIMEOUTS_MS[fn];
      expect(clientBudget, `${fn} must be registered in EDGE_FUNCTION_TIMEOUTS_MS`).toBeGreaterThan(
        0
      );

      const file = join(process.cwd(), "supabase", "functions", fn, "index.ts");
      const src = readFileSync(file, "utf8");
      const match = src.match(new RegExp(`const\\s+${constName}\\s*=\\s*([0-9_]+)`));
      // Fail closed: the const must exist and be parseable, or a rename/removal would silently
      // drop the guard for this function.
      expect(
        match,
        `${constName} not found in ${fn}/index.ts — did it get renamed/removed?`
      ).not.toBeNull();

      const serverBudget = Number(match![1].replace(/_/g, ""));
      expect(
        Number.isFinite(serverBudget) && serverBudget > 0,
        `${constName} must be a positive number`
      ).toBe(true);
      expect(
        serverBudget,
        `${fn}: server budget ${serverBudget}ms must stay >= ${MIN_MARGIN_MS}ms below the ${clientBudget}ms client budget`
      ).toBeLessThanOrEqual(clientBudget - MIN_MARGIN_MS);
    });
  }
});
