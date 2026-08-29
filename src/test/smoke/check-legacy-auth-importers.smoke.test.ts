// Smoke coverage for scripts/ci/check-legacy-auth-importers.mjs — the auth-rebuild Ship 5 guard
// that snapshot-locks which files may import the legacy auth modules scheduled for deletion. A
// NEW importer (a production file importing a legacy module that is not in the committed
// snapshot) fails CI (exit 1); the allowlist only shrinks, never grows silently.
//
// REPO_ROOT is `resolve(dirname(fileURLToPath(import.meta.url)), "..","..")` and the snapshot is
// read next to the guard (resolve(__dirname, "legacy-auth-importers.snapshot.json")), so cwd
// cannot steer it. We COPY the guard into a fixture at <root>/scripts/ci/ and run the COPY: from
// there REPO_ROOT = <root>, SRC_ROOT = <root>/src, and the snapshot is
// <root>/scripts/ci/legacy-auth-importers.snapshot.json. We build src trees + a snapshot to
// reproduce each real outcome: allowlisted importer → 0, a new unlisted production importer → 1,
// a test-dir importer ignored → 0, and the missing-snapshot fail-closed (exit 1).
//
// The real-repo pass runs the REAL guard via a resolved `const GUARD` binding, which is what
// makes check-guard-has-test credit this guard as tested.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-legacy-auth-importers.mjs");
const GUARD_SRC = readFileSync(GUARD, "utf8");

// A real legacy module from the guard's LEGACY_MODULES list — importing it is what the guard
// scans for. Using the exact string reproduces the regex the guard builds.
const LEGACY_IMPORT =
  'import { signIn } from "@/services/auth.service";\nexport const x = signIn;\n';
const CLEAN_FILE =
  'import { engine } from "@/features/auth/engine/use-sign-in-engine";\nexport const x = engine;\n';
const snapshot = (allowed: string[]) => JSON.stringify({ allowed }, null, 2) + "\n";

afterAll(cleanupGuardFixtures);

/** Run the COPIED guard in the fixture; return exit code (0 clean, 1 violation/fail-closed). */
function runCopiedGuard(root: string): number {
  try {
    execFileSync("node", [join(root, "scripts/ci/check-legacy-auth-importers.mjs")], {
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

describe("check-legacy-auth-importers guard (smoke)", () => {
  it("LAI-001: passes when the only legacy importer is on the snapshot allowlist", () => {
    const r = guardFixture({
      "scripts/ci/check-legacy-auth-importers.mjs": GUARD_SRC,
      "scripts/ci/legacy-auth-importers.snapshot.json": snapshot([
        "src/features/auth/legacy-consumer.ts",
      ]),
      "src/features/auth/legacy-consumer.ts": LEGACY_IMPORT,
      "src/features/auth/clean-consumer.ts": CLEAN_FILE, // no legacy import → never scanned in
    });
    expect(runCopiedGuard(r)).toBe(0);
  });

  it("LAI-002: FLAGS a NEW production importer of a legacy module absent from the snapshot (exit 1)", () => {
    const r = guardFixture({
      "scripts/ci/check-legacy-auth-importers.mjs": GUARD_SRC,
      "scripts/ci/legacy-auth-importers.snapshot.json": snapshot([]), // empty allowlist
      "src/features/checkout/sneaky-importer.ts": LEGACY_IMPORT, // new, unlisted, production
    });
    expect(runCopiedGuard(r)).toBe(1);
  });

  it("LAI-003: IGNORES a legacy import that lives in a test file (no false positive, exit 0)", () => {
    // The guard skips *.test.* files and test dirs; a legacy import there is not a production
    // importer, so an empty allowlist still passes.
    const r = guardFixture({
      "scripts/ci/check-legacy-auth-importers.mjs": GUARD_SRC,
      "scripts/ci/legacy-auth-importers.snapshot.json": snapshot([]),
      "src/features/auth/legacy.test.ts": LEGACY_IMPORT,
      "src/features/auth/__tests__/also-legacy.ts": LEGACY_IMPORT,
    });
    expect(runCopiedGuard(r)).toBe(0);
  });

  it("LAI-004: fails CLOSED (exit 1) when the snapshot JSON is missing", () => {
    const r = guardFixture({
      "scripts/ci/check-legacy-auth-importers.mjs": GUARD_SRC,
      "src/features/auth/clean-consumer.ts": CLEAN_FILE, // src exists so walk() succeeds
      // no legacy-auth-importers.snapshot.json → guard reports missing snapshot, exit 1
    });
    expect(runCopiedGuard(r)).toBe(1);
  });

  it("LAI-005: the real repo passes the guard", () => {
    expect(runRealGuard()).toBe(0);
  });
});
