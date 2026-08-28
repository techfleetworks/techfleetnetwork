// Smoke coverage for scripts/ci/check-guard-has-test.mjs (decisions.md §6) — the
// forcing function that requires every scripts/ci guard to have a committed test.
//
// This guard resolves its repo root from its OWN location (fileURLToPath), not cwd,
// so a fixture can't steer it by changing cwd. Instead we COPY the guard (self-contained,
// node built-ins only) into a throwaway scripts/ci/ next to fixture guards + a fixture
// src/test/ + a fixture guard-test-allowlist.json, and run the copy: its root resolves
// to the fixture, so it scans the fixture. That exercises the real guard logic against
// controlled inputs.
//
// Coverage rule under test: a guard counts as tested only when a test file names it in
// NON-COMMENT code AND invokes a guard subprocess (execFileSync/...). So fixture "tests"
// here use a real execFileSync line, and GHT-007/008 assert that a comment-only mention
// or a mention-without-exec does NOT count (the false positive judge-arch caught).
//
// IMPORTANT — no false positives: this meta-test must NEVER name a real guard filename
// in its own source, or the real guard (GHT-009, scanning the real src/test) would count
// that as coverage. Every fixture guard here is a FAKE name (check-alpha/beta/fixturedebt);
// the only real guard filename in this file is check-guard-has-test.mjs itself — which
// this file genuinely execs and tests.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-guard-has-test.mjs");
const GUARD_SRC = readFileSync(GUARD, "utf8");
const read = (rel: string) => readFileSync(resolve(REPO, rel), "utf8");

// A fixture "test" that genuinely execs a guard subprocess (satisfies the coverage rule).
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

/** Run a guard file with `node`; return its exit code (0 clean, 1 violation, 2 fail-closed). */
function run(guardPath: string): number {
  try {
    execFileSync("node", [guardPath], { stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

/**
 * Build a fixture repo and return the path to the copied guard to run.
 *  - scripts/ci/ : a COPY of the real guard + the named stub guards + (unless
 *    withAllowlist=false) guard-test-allowlist.json holding `allowlist`.
 *  - src/test/   : (unless withSrcTest=false) a base test that EXECS the copied guard so
 *    it counts itself as tested, plus `extraTests`.
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
  const copiedGuard = join(root, "scripts/ci/check-guard-has-test.mjs");
  writeFileSync(copiedGuard, GUARD_SRC);
  if (withAllowlist) {
    writeFileSync(join(root, "scripts/ci/guard-test-allowlist.json"), JSON.stringify(allowlist));
  }
  for (const g of stubGuards) {
    writeFileSync(join(root, "scripts/ci", g), "// stub guard\nprocess.exit(0)\n");
  }
  if (withSrcTest) {
    mkdirSync(join(root, "src/test"), { recursive: true });
    // Base test execs the copied guard by its own filename so it counts itself tested.
    writeFileSync(join(root, "src/test/_base.test.ts"), execTest("check-guard-has-test.mjs"));
    for (const [name, content] of Object.entries(extraTests)) {
      writeFileSync(join(root, "src/test", name), content);
    }
  }
  return copiedGuard;
}

describe("check-guard-has-test guard (smoke)", () => {
  // ---- Happy path ---------------------------------------------------------
  it("GHT-001: passes a new guard exercised by a committed test that execs it", () => {
    const g = fixture({
      stubGuards: ["check-alpha.mjs"],
      extraTests: { "alpha.test.ts": execTest("check-alpha.mjs") },
    });
    expect(run(g)).toBe(0);
  });

  // ---- Non-happy: the core false-green prevention -------------------------
  it("GHT-002: flags a new guard with NO committed test", () => {
    const g = fixture({ stubGuards: ["check-beta.mjs"] });
    expect(run(g)).toBe(1);
  });

  // ---- Ratchet behaviour (fixture-controlled allowlist, fake names) -------
  it("GHT-003: flags a guard that is tested but STILL on the allowlist (must shrink)", () => {
    const g = fixture({
      stubGuards: ["check-fixturedebt.mjs"],
      allowlist: ["check-fixturedebt.mjs"],
      extraTests: { "debt.test.ts": execTest("check-fixturedebt.mjs") },
    });
    expect(run(g)).toBe(1);
  });

  it("GHT-004: allows an allowlisted guard that has no test yet (known, tracked debt)", () => {
    const g = fixture({
      stubGuards: ["check-fixturedebt.mjs"],
      allowlist: ["check-fixturedebt.mjs"],
    });
    expect(run(g)).toBe(0);
  });

  // ---- Guard integrity: fail closed on missing inputs ---------------------
  it("GHT-005: fails CLOSED (exit 2) when the src/test tree is missing", () => {
    const g = fixture({ stubGuards: ["check-alpha.mjs"], withSrcTest: false });
    expect(run(g)).toBe(2);
  });

  it("GHT-006: fails CLOSED (exit 2) when the allowlist JSON is missing", () => {
    const g = fixture({ stubGuards: ["check-alpha.mjs"], withAllowlist: false });
    expect(run(g)).toBe(2);
  });

  // ---- No false positives: incidental mentions do NOT count as coverage ---
  it("GHT-007: a guard named ONLY in a comment is NOT counted as tested", () => {
    const g = fixture({
      stubGuards: ["check-alpha.mjs"],
      // The file execs a guard, but check-alpha.mjs appears only in a comment.
      extraTests: {
        "comment.test.ts": `// coverage note: check-alpha.mjs\n${execTest("check-guard-has-test.mjs")}`,
      },
    });
    expect(run(g)).toBe(1);
  });

  it("GHT-008: a guard named in code but never EXEC'd is NOT counted as tested", () => {
    const g = fixture({
      stubGuards: ["check-alpha.mjs"],
      // Names check-alpha.mjs in code, but the file never execs anything.
      extraTests: {
        "noexec.test.ts": 'const path = "check-alpha.mjs";\nexpect(path).toBeTruthy();\n',
      },
    });
    expect(run(g)).toBe(1);
  });

  // ---- The real repo + wiring ---------------------------------------------
  it("GHT-009: the real repo passes the guard (no new untested guards)", () => {
    expect(run(GUARD)).toBe(0);
  });

  it("GHT-010: the guard is wired into the BLOCKING lint-arch-critical CI matrix", () => {
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
