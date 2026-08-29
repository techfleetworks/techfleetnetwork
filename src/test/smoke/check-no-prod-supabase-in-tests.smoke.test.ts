// Smoke coverage for scripts/ci/check-no-prod-supabase-in-tests.mjs — a TEST-HYGIENE guard
// that fails CI when any test file references the PRODUCTION Supabase project ref. A test that
// points at prod can corrupt live data or leak prod secrets in a fixture (PRD G-03 / P-05 /
// UC-09). The guard is a static grep for the prod ref across two scopes: (a) any *.test/spec/e2e.*
// file anywhere under src/ or e2e/, and (b) EVERY code file under e2e/ or src/test/ — including
// plain-named helpers/fixtures, the coverage hole a basename-only filter used to miss.
// These tests prove the guard catches prod refs in BOTH scopes and fails closed — run the real
// guard against fixtures, assert exit codes.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-no-prod-supabase-in-tests.mjs");

// The literal production project ref the guard forbids (mirrors PROD_REF in the guard source).
// Split so the contiguous ref never appears on a line of THIS test file — otherwise the guard,
// which scans every test file under src/test/, would flag its own smoke test at repo scope.
// The fixtures below assemble the full ref at runtime, so on-disk fixtures still trip the guard.
const PROD_REF = "pzvqxdgozt" + "bfikfuifix";

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

describe("check-no-prod-supabase-in-tests hygiene guard (smoke)", () => {
  it("PROD-001: passes tests that target local/staging, never the prod ref", () => {
    // Both roots (src, e2e) must exist or the harness fails closed — seed each with a clean file.
    const r = guardFixture({
      "src/test/db.test.ts": 'const url = "http://127.0.0.1:54321"; // local supabase\n',
      "e2e/smoke.spec.ts": 'const url = process.env.STAGING_SUPABASE_URL ?? "";\n',
    });
    expect(runGuard(r)).toBe(0);
  });

  it("PROD-002: FLAGS a *.test.* file that hard-codes the prod project ref [scope a]", () => {
    const r = guardFixture({
      "src/test/db.test.ts": `const SUPABASE_URL = "https://${PROD_REF}.supabase.co";\n`,
      "e2e/smoke.spec.ts": 'const url = "http://127.0.0.1:54321";\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("PROD-003: FLAGS a plain-named helper under e2e/ that references the prod ref [scope b]", () => {
    // Not a *.test/spec/e2e.* file — only the path-based scope catches it. This is the
    // coverage hole a basename-only filter used to miss.
    const r = guardFixture({
      "e2e/support/seed.ts": `export const PROJECT = "${PROD_REF}";\n`,
      "src/test/db.test.ts": 'const url = "http://127.0.0.1:54321";\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("PROD-004: fails CLOSED (exit 2) when a scan root is missing", () => {
    // Neither src nor e2e exists, so the harness must fail closed.
    const r = guardFixture({ "README.md": "no scan roots here" });
    expect(runGuard(r)).toBe(2);
  });

  it("PROD-005: fails CLOSED (exit 1) when roots exist but hold zero test files", () => {
    // src/index.ts is under src/ but not src/test/, so it is out of scope; e2e/ holds no code.
    const r = guardFixture({
      "src/index.ts": "export const x = 1;\n",
      "e2e/README.md": "no test code here",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("PROD-006: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
