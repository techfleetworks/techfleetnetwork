// Unit coverage for scripts/ci/_schema-floor.mjs (ADR-0049) — the pure floor comparison behind the
// ADR-0036 schema gate's per-category baselines. A BASELINE is a FLOOR, not an exact band: the gate
// fails only on a DROP more than `tol` below the floor (a partial-capture regression that would
// silently under-verify the schema); benign GROWTH never fails (that was the #345 whack-a-mole). The
// gate's own smoke tests run under DB_SCHEMA_ROOT, which SKIPS the corpus baseline, so this logic was
// previously untested — these pin it directly, without prod or the real corpus.
import { describe, it, expect } from "vitest";
import { floorReport } from "../../../scripts/ci/_schema-floor.mjs";

const FLOORS = { table: 100, function: 50 };
const TOL = 2;

describe("schema-floor: drop-only baseline (ADR-0049)", () => {
  it("SF-001: a drop more than tol below the floor is a violation", () => {
    const { drops } = floorReport([{ kind: "table", size: 97 }], FLOORS, TOL); // 97 < 100 − 2
    expect(drops.map((d) => d.kind)).toEqual(["table"]);
    expect(drops[0].delta).toBe(3);
  });

  it("SF-002: a drop WITHIN tol is not a violation (floor − tol is the boundary)", () => {
    const { drops } = floorReport([{ kind: "table", size: 98 }], FLOORS, TOL); // 98 === 100 − 2
    expect(drops).toEqual([]);
  });

  it("SF-003: growth NEVER fails — the whack-a-mole fix (a floor, not a band)", () => {
    const { drops, grown } = floorReport([{ kind: "table", size: 250 }], FLOORS, TOL);
    expect(drops).toEqual([]);
    expect(grown.map((g) => g.kind)).toEqual(["table"]);
    expect(grown[0].delta).toBe(150);
  });

  it("SF-004: exactly on the floor is clean (no drop, no growth)", () => {
    const { drops, grown, noFloor } = floorReport([{ kind: "table", size: 100 }], FLOORS, TOL);
    expect([drops, grown, noFloor]).toEqual([[], [], []]);
  });

  it("SF-005: an active category with NO committed floor is a violation (a new category needs a tripwire)", () => {
    const { noFloor } = floorReport([{ kind: "index", size: 5 }], FLOORS, TOL);
    expect(noFloor.map((n) => n.kind)).toEqual(["index"]);
  });

  it("SF-006: drops, growth, and missing floors are reported together (no cross-category whack-a-mole)", () => {
    const r = floorReport(
      [
        { kind: "table", size: 90 }, // drop (−10)
        { kind: "function", size: 80 }, // growth (+30)
        { kind: "index", size: 5 }, // no floor
      ],
      FLOORS,
      TOL
    );
    expect(r.drops.map((d) => d.kind)).toEqual(["table"]);
    expect(r.grown.map((g) => g.kind)).toEqual(["function"]);
    expect(r.noFloor.map((n) => n.kind)).toEqual(["index"]);
  });
});
