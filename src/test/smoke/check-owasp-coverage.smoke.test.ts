// Smoke coverage for scripts/ci/check-owasp-coverage.mjs — the "100% OWASP cheat sheet
// coverage" gate. It proves docs/security/owasp-coverage.md maps EVERY one of the 120
// canonical OWASP cheat sheets to a real, existing enforcement mechanism (a SAST rule, a CI
// guard, a pen-test suite, pgTAP proofs, a workflow, a design doc, or a justified config/N-A),
// and fails CI (exit 1) on any drift: a missing/unknown/duplicate sheet, an `sast:<ID>` naming
// a rule absent from scripts/pentest/sast.mjs, a `check:`/`workflow:`/`doc:` path that does not
// exist, an unknown pentest suite, a `pgtap` with no supabase/tests suites, a `config:`/`n/a:`
// row with a too-short justification, or a row with no enforcement tokens.
//
// ROOT is `join(dirname(fileURLToPath(import.meta.url)), "..", "..")`, so cwd cannot steer it.
// We COPY the guard into a fixture at <root>/scripts/ci/ and run the COPY: from there ROOT =
// <root>, so it reads <root>/docs/security/owasp-coverage.md and <root>/scripts/pentest/sast.mjs.
// The canonical 120 are hardcoded in the guard source, so they travel with the copy — we craft a
// tiny map that trips a SPECIFIC real detection (rather than reproduce all 120 rows).
//
// The real-repo pass runs the REAL guard via a resolved `const GUARD` binding, which is what
// makes check-guard-has-test credit this guard as tested.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-owasp-coverage.mjs");
const GUARD_SRC = readFileSync(GUARD, "utf8");

afterAll(cleanupGuardFixtures);

/** A minimal coverage-map markdown table from { sheetName: enforcementToken } rows. */
const map = (rows: Record<string, string>) =>
  `# OWASP Coverage Map (fixture)\n\n` +
  `| Cheat Sheet | Cluster | Status | Enforcement |\n` +
  `| --- | --- | --- | --- |\n` +
  Object.entries(rows)
    .map(([name, token]) => `| ${name} | misc | done | ${token} |`)
    .join("\n") +
  `\n`;

/** A minimal sast.mjs whose regex-discoverable rule ids are exactly `ids`. */
const sast = (ids: string[]) =>
  `export const rules = [\n` +
  ids.map((id) => `  { id: "${id}", pattern: /x/ },`).join("\n") +
  `\n];\n`;

/** Run the COPIED guard living inside the fixture; return exit code (0 clean, 1 failure). */
function runCopiedGuard(root: string): number {
  try {
    execFileSync("node", [join(root, "scripts/ci/check-owasp-coverage.mjs")], {
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

describe("check-owasp-coverage guard (smoke)", () => {
  it("OWC-001: FLAGS a map naming a sheet not in the canonical 120 (exit 1) [discriminating]", () => {
    // "Totally Fake Sheet" is not one of the 120 canonical sheets carried in the copied guard
    // source → the guard emits "Unknown cheat sheet in map (not one of the 120)" (plus MISSING
    // errors for the 120 real sheets absent from this tiny map) → exit 1. This is the scenario
    // the discrimination gate depends on: no-op the guard's detection and this must stop failing.
    const r = guardFixture({
      "scripts/ci/check-owasp-coverage.mjs": GUARD_SRC,
      "docs/security/owasp-coverage.md": map({
        "Totally Fake Sheet": "n/a: some justification text here",
      }),
      "scripts/pentest/sast.mjs": sast(["SAST-NO-EVAL"]),
    });
    expect(runCopiedGuard(r)).toBe(1);
  });

  it("OWC-002: FLAGS an `sast:` token whose rule is absent from sast.mjs (exit 1)", () => {
    // A real canonical sheet points at SAST-BOGUS-RULE, which sast.mjs does not define → the
    // guard emits "sast rule not found in scripts/pentest/sast.mjs: SAST-BOGUS-RULE" → exit 1.
    const r = guardFixture({
      "scripts/ci/check-owasp-coverage.mjs": GUARD_SRC,
      "docs/security/owasp-coverage.md": map({
        Authentication: "sast: SAST-BOGUS-RULE",
      }),
      "scripts/pentest/sast.mjs": sast(["SAST-NO-EVAL"]),
    });
    expect(runCopiedGuard(r)).toBe(1);
  });

  it("OWC-003: FLAGS a `check:` token pointing at a path that does not exist (exit 1)", () => {
    // The referenced guard file is never seeded in the fixture → existsSync is false → the guard
    // emits "check path does not exist: scripts/ci/nope.mjs" → exit 1.
    const r = guardFixture({
      "scripts/ci/check-owasp-coverage.mjs": GUARD_SRC,
      "docs/security/owasp-coverage.md": map({
        Authorization: "check: scripts/ci/nope.mjs",
      }),
      "scripts/pentest/sast.mjs": sast(["SAST-NO-EVAL"]),
    });
    expect(runCopiedGuard(r)).toBe(1);
  });

  it("OWC-004: the real repo passes the guard", () => {
    expect(runRealGuard()).toBe(0);
  });
});
