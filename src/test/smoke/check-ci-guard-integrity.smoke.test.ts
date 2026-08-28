// Smoke coverage for scripts/ci/check-ci-guard-integrity.mjs (decisions.md §6) — the
// META-GUARD that scans every other scripts/ci guard for the three false-green defect
// classes. It is cwd-based (scans process.cwd()/scripts/ci), so we run the REAL meta-guard
// with cwd pointed at throwaway fixtures whose scripts/ci/ holds guard files exhibiting each
// defect, and assert its exit code. "Guard the guard": the guard that guards all guards must
// itself be proven.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-ci-guard-integrity.mjs");

const tmps: string[] = [];
afterAll(() => {
  for (const d of tmps) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
});

/** Run the real meta-guard with cwd=root; return exit code (0 clean, 1 violation, 2 fail-closed). */
function runGuard(root: string): number {
  try {
    execFileSync("node", [GUARD], { cwd: root, stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

/** Fixture repo whose scripts/ci/ holds the given {filename: source} guard files. */
function fixture(guards: Record<string, string>, makeCiDir = true): string {
  const root = mkdtempSync(join(tmpdir(), "mg-guard-"));
  tmps.push(root);
  if (makeCiDir) {
    mkdirSync(join(root, "scripts/ci"), { recursive: true });
    for (const [name, src] of Object.entries(guards)) {
      writeFileSync(join(root, "scripts/ci", name), src);
    }
  }
  return root;
}

const CLEAN = 'console.log("clean guard");\n';

describe("check-ci-guard-integrity meta-guard (smoke)", () => {
  // ---- Happy path ---------------------------------------------------------
  it("MG-001: passes a clean guard set (no defect classes)", () => {
    expect(runGuard(fixture({ "check-clean.mjs": CLEAN }))).toBe(0);
  });

  // ---- Class 1: exit(0) inside a catch (false green) ----------------------
  it("MG-002: flags exit(0) inside a catch", () => {
    const r = fixture({
      "check-clean.mjs": CLEAN,
      "check-swallow.mjs": "try {\n  doThing();\n} catch (e) {\n  process.exit(0);\n}\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("MG-005: allows a DELIBERATE exit(0)-in-catch annotated with ci-guard-integrity-ok", () => {
    const r = fixture({
      "check-optout.mjs":
        "try {\n  doThing();\n} catch (e) {\n  // ci-guard-integrity-ok: intentional fail-open\n  process.exit(0);\n}\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  // ---- Class 2: new URL(...).pathname (Windows path crash) ----------------
  it("MG-003: flags new URL(...).pathname", () => {
    const r = fixture({
      "check-pathbug.mjs": 'const p = new URL(".", import.meta.url).pathname;\nconsole.log(p);\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  // ---- Class 3: hand-rolled readdir not via the harness -------------------
  it("MG-004: flags a guard that readdirs without importing the _guard.mjs harness", () => {
    const r = fixture({
      "check-walk.mjs": 'import { readdirSync } from "node:fs";\nconst x = readdirSync("./");\n',
    });
    expect(runGuard(r)).toBe(1);
  });

  it("MG-006: allows a readdir guard that DOES import the _guard.mjs harness", () => {
    const r = fixture({
      "check-harness.mjs":
        'import { runScanGuard } from "./_guard.mjs";\nimport { readdirSync } from "node:fs";\nreaddirSync("x");\n',
    });
    expect(runGuard(r)).toBe(0);
  });

  it("MG-007: allows a readdir guard on the reviewed BESPOKE_DIR_READERS allowlist (arch-gate.mjs)", () => {
    const r = fixture({
      "arch-gate.mjs": 'import { readdirSync } from "node:fs";\nreaddirSync("./");\n',
    });
    expect(runGuard(r)).toBe(0);
  });

  // ---- Fail closed --------------------------------------------------------
  it("MG-008: fails CLOSED (exit 2) when scripts/ci is missing", () => {
    expect(runGuard(fixture({}, /* makeCiDir */ false))).toBe(2);
  });

  it("MG-009: fails CLOSED (exit 2) when scripts/ci has zero guard scripts", () => {
    // helper.mjs is not a guard (doesn't start with check-, isn't arch-gate.mjs) -> 0 guards.
    expect(runGuard(fixture({ "helper.mjs": CLEAN }))).toBe(2);
  });

  // ---- The real repo ------------------------------------------------------
  it("MG-010: the real repo passes the meta-guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
