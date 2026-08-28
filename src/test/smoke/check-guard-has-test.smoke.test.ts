// Smoke coverage for scripts/ci/check-guard-has-test.mjs (decisions.md §6) — the
// forcing function that requires every scripts/ci guard to have a committed test.
//
// We run the REAL guard (not a copy — so its TypeScript dependency resolves and we test the
// shipped code) pointed at throwaway fixture repos via its GUARD_HAS_TEST_ROOT override.
// Each fixture is a scripts/ci/ (stub guards + guard-test-allowlist.json) plus a src/test/
// with scenario test files. The real guard itself is NOT among the fixture's guards, so no
// fixture needs to self-credit it.
//
// Coverage rule under test: the guard PARSES each test with the TS compiler API and credits
// a guard only when that guard's path is actually passed to a subprocess exec (directly or
// via a resolved `const X = resolve(...)` binding). So a comment mention (GHT-007), a code
// mention that never execs (GHT-008), and a file that execs guard A while only NAMING guard
// B (GHT-010) all fail to credit — while an exec via a const binding does (GHT-011).
//
// No false positives: the only exec of a REAL guard path in this file is runGuard()'s
// `execFileSync("node", [GUARD])`, which credits check-guard-has-test itself. Every fixture
// guard is a FAKE name embedded in string content, never passed to a real exec here.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-guard-has-test.mjs");
const read = (rel: string) => readFileSync(resolve(REPO, rel), "utf8");

// A fixture "test" that genuinely execs a guard by a direct string-literal argument.
const execTest = (guardFile: string) => `execFileSync("node", ["${guardFile}"]);\n`;

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

/**
 * Run the REAL guard; return its exit code (0 clean, 1 violation, 2 fail-closed).
 * With `root`, point the guard at a fixture repo via GUARD_HAS_TEST_ROOT; without, it scans
 * the real repo. GUARD is a module const, so the AST analyzer credits check-guard-has-test
 * from this call — its only real-guard credit.
 */
function runGuard(root?: string): number {
  try {
    execFileSync("node", [GUARD], {
      stdio: "pipe",
      env: root ? { ...process.env, GUARD_HAS_TEST_ROOT: root } : process.env,
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

/**
 * Build a fixture repo and return its root.
 *  - scripts/ci/ : the named stub guards + (unless withAllowlist=false) guard-test-allowlist.json.
 *  - src/test/   : (unless withSrcTest=false) the `extraTests` files.
 */
function fixture(opts: {
  stubGuards?: string[];
  extraTests?: Record<string, string>;
  allowlist?: string[];
  withSrcTest?: boolean;
  withAllowlist?: boolean;
}): string {
  const {
    stubGuards = [],
    extraTests = {},
    allowlist = [],
    withSrcTest = true,
    withAllowlist = true,
  } = opts;
  const root = mkdtempSync(join(tmpdir(), "ght-guard-"));
  tmps.push(root);
  mkdirSync(join(root, "scripts/ci"), { recursive: true });
  if (withAllowlist) {
    writeFileSync(join(root, "scripts/ci/guard-test-allowlist.json"), JSON.stringify(allowlist));
  }
  for (const g of stubGuards) {
    writeFileSync(join(root, "scripts/ci", g), "// stub guard\nprocess.exit(0)\n");
  }
  if (withSrcTest) {
    mkdirSync(join(root, "src/test"), { recursive: true });
    for (const [name, content] of Object.entries(extraTests)) {
      writeFileSync(join(root, "src/test", name), content);
    }
  }
  return root;
}

describe("check-guard-has-test guard (smoke)", () => {
  // ---- Happy path ---------------------------------------------------------
  it("GHT-001: passes a new guard exercised by a committed test that execs it", () => {
    const r = fixture({
      stubGuards: ["check-alpha.mjs"],
      extraTests: { "alpha.test.ts": execTest("check-alpha.mjs") },
    });
    expect(runGuard(r)).toBe(0);
  });

  // ---- Non-happy: the core false-green prevention -------------------------
  it("GHT-002: flags a new guard with NO committed test", () => {
    const r = fixture({ stubGuards: ["check-beta.mjs"] });
    expect(runGuard(r)).toBe(1);
  });

  // ---- Ratchet behaviour (fixture-controlled allowlist, fake names) -------
  it("GHT-003: flags a guard that is tested but STILL on the allowlist (must shrink)", () => {
    const r = fixture({
      stubGuards: ["check-fixturedebt.mjs"],
      allowlist: ["check-fixturedebt.mjs"],
      extraTests: { "debt.test.ts": execTest("check-fixturedebt.mjs") },
    });
    expect(runGuard(r)).toBe(1);
  });

  it("GHT-004: allows an allowlisted guard that has no test yet (known, tracked debt)", () => {
    const r = fixture({
      stubGuards: ["check-fixturedebt.mjs"],
      allowlist: ["check-fixturedebt.mjs"],
    });
    expect(runGuard(r)).toBe(0);
  });

  // ---- Guard integrity: fail closed on missing inputs ---------------------
  it("GHT-005: fails CLOSED (exit 2) when the src/test tree is missing", () => {
    const r = fixture({ stubGuards: ["check-alpha.mjs"], withSrcTest: false });
    expect(runGuard(r)).toBe(2);
  });

  it("GHT-006: fails CLOSED (exit 2) when the allowlist JSON is missing", () => {
    const r = fixture({ stubGuards: ["check-alpha.mjs"], withAllowlist: false });
    expect(runGuard(r)).toBe(2);
  });

  // ---- No false positives: only an ACTUAL exec of the guard counts ---------
  it("GHT-007: a guard named ONLY in a comment is NOT counted as tested", () => {
    const r = fixture({
      stubGuards: ["check-alpha.mjs"],
      extraTests: {
        "comment.test.ts": `// coverage note: check-alpha.mjs\n${execTest("check-somethingelse.mjs")}`,
      },
    });
    expect(runGuard(r)).toBe(1);
  });

  it("GHT-008: a guard named in code but never EXEC'd is NOT counted as tested", () => {
    const r = fixture({
      stubGuards: ["check-alpha.mjs"],
      extraTests: {
        "noexec.test.ts": 'const path = "check-alpha.mjs";\nexpect(path).toBeTruthy();\n',
      },
    });
    expect(runGuard(r)).toBe(1);
  });

  it("GHT-010: a guard code-named in a file that execs a DIFFERENT guard is NOT credited", () => {
    // The cross-credit hole: this test execs check-gamma but only NAMES check-beta in a const.
    // The AST analysis must not credit check-beta.
    const r = fixture({
      stubGuards: ["check-beta.mjs"],
      extraTests: {
        "cross.test.ts": `const other = "check-beta.mjs";\n${execTest("check-gamma.mjs")}`,
      },
    });
    expect(runGuard(r)).toBe(1);
  });

  it("GHT-011: a guard exec'd via a resolved const binding IS credited (no false negative)", () => {
    // The real guard tests exec via `const GUARD = resolve(...)`, not a literal — this proves
    // that pattern is followed, so the stricter check does not drop genuine coverage.
    const r = fixture({
      stubGuards: ["check-alpha.mjs"],
      extraTests: {
        "viaconst.test.ts": 'const GA = "check-alpha.mjs";\nexecFileSync("node", [GA]);\n',
      },
    });
    expect(runGuard(r)).toBe(0);
  });

  it("GHT-013: a guard filename passed to regex.exec is NOT counted (not a subprocess)", () => {
    // `.exec` is also RegExp.prototype.exec — it must not be treated as a subprocess exec.
    const r = fixture({
      stubGuards: ["check-alpha.mjs"],
      extraTests: {
        "regex.test.ts": `const rx = /x/;\nrx.exec("check-alpha.mjs");\n${execTest("check-gamma.mjs")}`,
      },
    });
    expect(runGuard(r)).toBe(1);
  });

  it("GHT-014: an ambiguous same-name const (declared in two blocks) does NOT cross-credit", () => {
    // DUP is bound twice; the exec of DUP in block a must credit NEITHER guard (ambiguous).
    const r = fixture({
      stubGuards: ["check-alpha.mjs", "check-beta.mjs"],
      extraTests: {
        "dup.test.ts":
          'describe("a", () => {\n  const DUP = "check-alpha.mjs";\n  execFileSync("node", [DUP]);\n});\n' +
          'describe("b", () => {\n  const DUP = "check-beta.mjs";\n});\n',
      },
    });
    expect(runGuard(r)).toBe(1);
  });

  it("GHT-015: a guard exec'd via a template-literal path IS credited (no false negative)", () => {
    const r = fixture({
      stubGuards: ["check-alpha.mjs"],
      extraTests: {
        "template.test.ts":
          'const dir = "scripts/ci";\nexecFileSync("node", [`${dir}/check-alpha.mjs`]);\n',
      },
    });
    expect(runGuard(r)).toBe(0);
  });

  // ---- The real repo + wiring ---------------------------------------------
  it("GHT-009: the real repo passes the guard (no new untested guards)", () => {
    expect(runGuard()).toBe(0);
  });

  it("GHT-012: the guard is wired into the BLOCKING lint-arch-critical CI matrix", () => {
    const ci = read(".github/workflows/ci.yml");
    const criticalBlock = ci.slice(
      ci.indexOf("lint-arch-critical:"),
      ci.indexOf("lint-arch:") > ci.indexOf("lint-arch-critical:")
        ? ci.indexOf("lint-arch:")
        : ci.length
    );
    expect(criticalBlock).toContain("check-guard-has-test.mjs");
  });
});
