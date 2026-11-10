// Smoke coverage for scripts/ci/check-invokeedge-schema-adoption.mjs — the ARCH-2/ARCH-4 ratchet
// that forces every invokeEdge call site to carry a request/response contract and keeps the backlog
// of schema-less callers a monotonically shrinking, honest count. These tests run the REAL guard
// against throwaway fixtures (cwd = fixture root, the guard reads cwd-relative paths) and assert its
// exit codes — the discrimination proof required by ADR-0023: the guard reds on a NEW schema-less
// caller, reds on a STALE (un-tightened) snapshot, and fails CLOSED on a missing snapshot / empty scan.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-invokeedge-schema-adoption.mjs");

afterAll(cleanupGuardFixtures);

/** Run the real guard with cwd=root; return exit code (0 clean, 1 ratchet violation, 2 fail-closed). */
function runGuard(root: string): number {
  try {
    execFileSync("node", [GUARD], { cwd: root, stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const SNAP = "scripts/ci/invokeedge-schema-adoption.snapshot.json";
const snap = (callers: Record<string, number>) => JSON.stringify({ callers });

describe("check-invokeedge-schema-adoption guard (smoke)", () => {
  it("ADOPT-001: passes when every call site carries a schema and the snapshot is empty", () => {
    const r = guardFixture({
      "src/services/good.service.ts": `invokeEdge("fn", { body: {}, responseSchema: s });`,
      [SNAP]: snap({}),
    });
    expect(runGuard(r)).toBe(0);
  });

  it("ADOPT-002: passes when a schema-less caller matches its snapshot count exactly (known backlog)", () => {
    const r = guardFixture({
      "src/services/legacy.service.ts": `invokeEdge("fn", { body: {} });`,
      [SNAP]: snap({ "src/services/legacy.service.ts": 1 }),
    });
    expect(runGuard(r)).toBe(0);
  });

  it("ADOPT-003: FLAGS a NEW schema-less call site that is not in the snapshot (regression)", () => {
    const r = guardFixture({
      "src/services/new.service.ts": `invokeEdge("fn", { body: { a: 1 } });`,
      [SNAP]: snap({}),
    });
    expect(runGuard(r)).toBe(1);
  });

  it("ADOPT-004: FLAGS an existing caller that dropped its schema (count rose above snapshot)", () => {
    const r = guardFixture({
      "src/services/x.service.ts": `invokeEdge("a", { body: {} }); invokeEdge("b", { body: {} });`,
      [SNAP]: snap({ "src/services/x.service.ts": 1 }),
    });
    expect(runGuard(r)).toBe(1);
  });

  it("ADOPT-005: FLAGS a STALE snapshot (backlog shrank but the number was not tightened)", () => {
    const r = guardFixture({
      "src/services/x.service.ts": `invokeEdge("a", { body: {}, bodySchema: s });`,
      [SNAP]: snap({ "src/services/x.service.ts": 1 }),
    });
    expect(runGuard(r)).toBe(1);
  });

  it("ADOPT-006: fails CLOSED (exit 2) when the snapshot file is missing", () => {
    const r = guardFixture({
      "src/services/x.service.ts": `invokeEdge("fn", { body: {}, responseSchema: s });`,
    });
    expect(runGuard(r)).toBe(2);
  });

  it("ADOPT-007: fails CLOSED (exit 2) when src has no scannable source files (vacuous scan)", () => {
    const r = guardFixture({ "src/README.md": "no ts here", [SNAP]: snap({}) });
    expect(runGuard(r)).toBe(2);
  });

  it("ADOPT-008: EXCLUDES src/features/auth/** callers (owned by the auth refactor, sessionPort API)", () => {
    const r = guardFixture({
      "src/features/auth/engine/use-x.ts": `sessionPort.invokeEdge("fn", { body: {} });`,
      [SNAP]: snap({}),
    });
    expect(runGuard(r)).toBe(0);
  });

  it("ADOPT-009: does NOT count a invokeEdge() mentioned only in a docblock comment", () => {
    const r = guardFixture({
      "src/lib/edge/notes.ts": `/**\n * precedence: an explicit invokeEdge({ timeoutMs }) wins.\n */\nexport const x = 1;\n`,
      [SNAP]: snap({}),
    });
    expect(runGuard(r)).toBe(0);
  });

  it("ADOPT-010: the real repo passes the guard (snapshot is in sync)", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
