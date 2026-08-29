// Smoke coverage for scripts/ci/check-no-legacy-auth-service.mjs — the AUTH-ARCH-CUTOVER-015
// guard that fails CI if the deleted legacy `src/services/auth.service.ts` is ever
// re-introduced at that exact path.
//
// This guard roots itself from `fileURLToPath(import.meta.url)` (FORBIDDEN =
// resolve(__dirname, "..","..","src/services/auth.service.ts")), so cwd cannot steer it.
// To exercise a real violation we COPY the guard into a throwaway fixture at
// <root>/scripts/ci/ and run the COPY: from there the guard resolves `../..` = <root>, so the
// forbidden path is <root>/src/services/auth.service.ts. Creating that file in the fixture
// reproduces the exact re-introduction the guard is built to catch (→ exit 1); a fixture
// without it is clean (→ exit 0).
//
// The real-repo pass runs the REAL guard via a resolved `const GUARD` binding — that exec is
// what makes check-guard-has-test credit this guard as tested.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-no-legacy-auth-service.mjs");
const GUARD_SRC = readFileSync(GUARD, "utf8");

afterAll(cleanupGuardFixtures);

/** Run the COPIED guard living inside the fixture; return exit code (0 clean, 1 violation). */
function runCopiedGuard(root: string): number {
  try {
    execFileSync("node", [join(root, "scripts/ci/check-no-legacy-auth-service.mjs")], {
      stdio: "pipe",
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

/** Run the REAL guard (resolved const → credited by check-guard-has-test); return exit code. */
function runRealGuard(): number {
  try {
    execFileSync("node", [GUARD], { stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("check-no-legacy-auth-service guard (smoke)", () => {
  it("NLAS-001: passes when the forbidden legacy file is absent (clean tree)", () => {
    // Copied guard + a benign sibling file, but NO src/services/auth.service.ts.
    const r = guardFixture({
      "scripts/ci/check-no-legacy-auth-service.mjs": GUARD_SRC,
      "src/features/auth/services/session.service.ts": "export const ok = true;\n",
    });
    expect(runCopiedGuard(r)).toBe(0);
  });

  it("NLAS-002: FLAGS a re-introduced src/services/auth.service.ts (exit 1)", () => {
    // The exact re-introduction AUTH-ARCH-CUTOVER-015 locks out.
    const r = guardFixture({
      "scripts/ci/check-no-legacy-auth-service.mjs": GUARD_SRC,
      "src/services/auth.service.ts": "// the deleted 625-line legacy service, revived\n",
    });
    expect(runCopiedGuard(r)).toBe(1);
  });

  it("NLAS-003: the real repo passes the guard", () => {
    expect(runRealGuard()).toBe(0);
  });
});
