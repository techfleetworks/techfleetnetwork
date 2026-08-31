// Smoke coverage for scripts/ci/check-suppressforward-has-report.mjs — SUPPRESS-FORWARD-HAS-REPORT-001 (ADR-0033).
// The guard makes `logger.error(..., { suppressForward: true })` safe-by-construction: it may only
// appear where the same function also reports the error (report/reportError/handleServiceError),
// so the flag can never become a silent drop once logger_error_reporting ramps.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-suppressforward-has-report.mjs");

afterAll(cleanupGuardFixtures);

/** Run the guard with cwd = a throwaway fixture repo; return exit code (0 ok, 1 violation, 2 fail-closed). */
function run(files: Record<string, string>): number {
  const root = guardFixture(files);
  try {
    execFileSync("node", [GUARD], { stdio: "pipe", cwd: root });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const PAIRED = `
export function save(e: unknown) {
  log.error("save", "failed", {}, e, { suppressForward: true });
  reportError(e, "svc.save");
}
`;

const UNPAIRED = `
export function save(e: unknown) {
  log.error("save", "failed", {}, e, { suppressForward: true });
  // no report here — once ramped this error vanishes
}
`;

const REPORT_IN_OTHER_FN = `
export function save(e: unknown) {
  log.error("save", "failed", {}, e, { suppressForward: true });
}
export function elsewhere(e: unknown) {
  reportError(e, "svc.elsewhere");
}
`;

const NO_SUPPRESS = `
export function save(e: unknown) {
  log.error("save", "failed", {}, e);
}
`;

describe("check-suppressforward-has-report guard (smoke)", () => {
  it("SFR-001: passes when suppressForward is paired with reportError in the same function", () => {
    expect(run({ "src/services/a.ts": PAIRED })).toBe(0);
  });

  it("SFR-002: FLAGS (exit 1) suppressForward with NO report in the function (silent-drop lever)", () => {
    expect(run({ "src/services/a.ts": UNPAIRED })).toBe(1);
  });

  it("SFR-003: FLAGS (exit 1) when the report is in a DIFFERENT function (same-function scope)", () => {
    expect(run({ "src/services/a.ts": REPORT_IN_OTHER_FN })).toBe(1);
  });

  it("SFR-004: passes when there is no suppressForward at all", () => {
    expect(run({ "src/services/a.ts": NO_SUPPRESS })).toBe(0);
  });

  it("SFR-005: the REAL repo passes (all suppressForward uses are paired)", () => {
    let code = 0;
    try {
      execFileSync("node", [GUARD], { stdio: "pipe", cwd: REPO });
    } catch (e) {
      code = (e as { status?: number }).status ?? 1;
    }
    expect(code).toBe(0);
  });

  it("SFR-006: fails CLOSED (exit 2) when the src root is missing", () => {
    // fixture with a file but no src/ dir → runScanGuard cannot scan its root → exit 2
    expect(run({ "readme.md": "x" })).toBe(2);
  });
});
