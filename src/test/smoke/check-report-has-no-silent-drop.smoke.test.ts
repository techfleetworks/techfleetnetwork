// Smoke coverage for scripts/ci/check-report-has-no-silent-drop.mjs — REPORT-NO-SILENT-DROP-001 (ADR-0031).
// The guard asserts report()'s `if (!classified.report)` branch records via recordClassifiedDrop
// before returning, so the reporter can never regain a silent-drop black hole. These scenarios run
// the REAL guard against throwaway report.ts fixtures via the REPORT_GUARD_FILE seam and assert exit
// codes: a recorded drop passes, a bare `return` is flagged, and structural surprises fail CLOSED.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-report-has-no-silent-drop.mjs");

afterAll(cleanupGuardFixtures);

/**
 * Run the guard.
 *  - content === null           → no REPORT_GUARD_FILE override → inspect the real shipped report.ts
 *  - opts.missing               → point REPORT_GUARD_FILE at a non-existent file (fail-closed path)
 *  - otherwise                  → write `content` as a fixture report.ts and inspect it
 * Returns the exit code (0 ok, 1 violation, 2 fail-closed).
 */
function run(content: string | null, opts: { missing?: boolean } = {}): number {
  const root = guardFixture({ "readme.md": "x" });
  const env: Record<string, string> = { ...process.env };
  if (opts.missing) {
    env.REPORT_GUARD_FILE = resolve(root, "does-not-exist.ts");
  } else if (content !== null) {
    const p = resolve(root, "report.ts");
    writeFileSync(p, content);
    env.REPORT_GUARD_FILE = p;
  } else {
    delete env.REPORT_GUARD_FILE; // inspect the real report.ts
  }
  try {
    execFileSync("node", [GUARD], { stdio: "pipe", env });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const RECORDS = `
function report(error: unknown, ctx: { source: string }): void {
  const classified = classify(error);
  if (!classified.report) {
    recordClassifiedDrop(classified.reason ?? "unknown", ctx.source);
    return;
  }
  internalReportError(error);
}
`;

const SILENT = `
function report(error: unknown, ctx: { source: string }): void {
  const classified = classify(error);
  if (!classified.report) {
    return;
  }
  internalReportError(error);
}
`;

// recordClassifiedDrop IS called, but OUTSIDE the drop branch — the AST scope check must still flag
// the branch as a silent drop (this is exactly the false-green a whole-file regex would allow).
const RECORDS_OUTSIDE_BRANCH = `
function report(error: unknown, ctx: { source: string }): void {
  recordClassifiedDrop("elsewhere", ctx.source);
  const classified = classify(error);
  if (!classified.report) {
    return;
  }
  internalReportError(error);
}
`;

const NO_REPORT_FN = `
function somethingElse(x: number): number {
  if (!x) {
    return 0;
  }
  return x + 1;
}
`;

describe("check-report-has-no-silent-drop guard (smoke)", () => {
  it("RNSD-001: passes when the drop branch records via recordClassifiedDrop", () => {
    expect(run(RECORDS)).toBe(0);
  });

  it("RNSD-002: FLAGS (exit 1) a bare `return` in the drop branch (the black-hole regression)", () => {
    expect(run(SILENT)).toBe(1);
  });

  it("RNSD-003: FLAGS (exit 1) when the recorder is called OUTSIDE the drop branch (AST scope, not regex)", () => {
    expect(run(RECORDS_OUTSIDE_BRANCH)).toBe(1);
  });

  it("RNSD-004: the REAL shipped report.ts records its drop (exit 0)", () => {
    expect(run(null)).toBe(0);
  });

  it("RNSD-005: fails CLOSED (exit 2) when the `report` function is absent (structure changed)", () => {
    expect(run(NO_REPORT_FN)).toBe(2);
  });

  it("RNSD-006: fails CLOSED (exit 2) when the target file is missing", () => {
    expect(run(null, { missing: true })).toBe(2);
  });
});
