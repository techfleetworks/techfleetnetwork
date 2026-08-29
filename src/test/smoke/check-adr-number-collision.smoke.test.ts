// Smoke coverage for scripts/ci/check-adr-number-collision.mjs — the ADR-NUMBER-001 guard that
// fails CI when two files in docs/adr/ share a `NNNN` number prefix. The number IS an ADR's
// identity: cross-references ("see ADR-0012") and `docs/adr/NNNN-*.md` links all key on it, so a
// duplicate silently makes every such reference ambiguous. It has already happened four times on
// `main` (0009/0013/0014/0016). These tests run the REAL guard against fixtures and assert exit
// codes: clean set passes, a fresh duplicate number fails, a malformed filename fails, and a
// missing docs/adr dir fails CLOSED.
//
// The guard reads its dir via the RELATIVE path `docs/adr`, i.e. relative to process.cwd() — so
// fixtures steer it purely by running the real guard with cwd = the fixture root.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-adr-number-collision.mjs");

afterAll(cleanupGuardFixtures);

/** Run the real guard with cwd=root; return exit code (0 clean, 1 violation/fail-closed). */
function runGuard(root: string): number {
  try {
    execFileSync("node", [GUARD], { cwd: root, stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("check-adr-number-collision guard (smoke)", () => {
  it("ADR-001: passes a docs/adr with all-unique 4-digit number prefixes", () => {
    const r = guardFixture({
      "docs/adr/0001-first-decision.md": "# ADR 1\n",
      "docs/adr/0002-second-decision.md": "# ADR 2\n",
      "docs/adr/README.md": "index, not an ADR\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("ADR-002: FLAGS two ADRs that share the same NNNN number (the real collision)", () => {
    const r = guardFixture({
      "docs/adr/0007-consent-ledger.md": "# ADR 7a\n",
      "docs/adr/0007-fleety-retrieval.md": "# ADR 7b\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("ADR-003: FLAGS a filename without the required 4-digit number prefix (malformed)", () => {
    const r = guardFixture({
      "docs/adr/0001-ok.md": "# ADR 1\n",
      "docs/adr/decision-without-number.md": "# no numeric prefix\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("ADR-004: fails CLOSED (exit 1) when docs/adr is missing", () => {
    const r = guardFixture({ "README.md": "no adr dir here" });
    expect(runGuard(r)).toBe(1);
  });

  it("ADR-005: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
