// Smoke coverage for scripts/ci/arch-gate.mjs — the flagship MECHANICAL architecture gate
// (the deterministic half of the blocking arch gate; judge-arch is the review half). It is
// cwd-based (ROOT = process.cwd()) and reads arch-gate.config.json + arch-gate.waivers.json
// from ROOT, so we run the REAL engine against throwaway fixture repos and assert exit codes.
// "Guard the guard": the engine that enforces every structural rule must itself be proven.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/arch-gate.mjs");

const TOKEN = "ZZ_ARCHGATE_FORBIDDEN_TOKEN";
const RULE = "fixture-no-forbidden-token";
// Builtins default ON — disable them so only the explicit fixture rule can fire.
const CONFIG = {
  ignore: [],
  builtins: { emptyCatch: false, swallowReturn: false, keepInSync: false },
  rules: [
    {
      name: RULE,
      include: ["src/**"],
      exclude: ["src/allowed/**"],
      forbid: [TOKEN],
      message: "fixture rule",
    },
  ],
};

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

/** Run the real arch-gate with cwd=root; return exit code (0 clean, 1 violation, 2 fail-closed). */
function runGate(root: string): number {
  try {
    execFileSync("node", [GUARD], { cwd: root, stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

/** Fixture repo with an arch-gate config (unless withConfig=false), waivers, and code files. */
function fixture(opts: {
  waivers?: unknown[];
  files?: Record<string, string>;
  config?: unknown;
  withConfig?: boolean;
}): string {
  const { waivers = [], files = {}, config = CONFIG, withConfig = true } = opts;
  const root = mkdtempSync(join(tmpdir(), "ag-guard-"));
  tmps.push(root);
  if (withConfig) writeFileSync(join(root, "arch-gate.config.json"), JSON.stringify(config));
  writeFileSync(join(root, "arch-gate.waivers.json"), JSON.stringify(waivers));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(resolve(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

const waiverFor = (path: string, expires = "") => ({
  rule: RULE,
  path,
  reason: "fixture",
  approvedBy: "test",
  expires,
});

describe("arch-gate mechanical gate (smoke)", () => {
  // ---- Happy path ---------------------------------------------------------
  it("AG-001: passes code that violates no rule", () => {
    expect(runGate(fixture({ files: { "src/ok.ts": 'const x = "fine";\n' } }))).toBe(0);
  });

  // ---- Violation detection ------------------------------------------------
  it("AG-002: fails on a forbidden pattern in an included path", () => {
    expect(runGate(fixture({ files: { "src/bad.ts": `const x = "${TOKEN}";\n` } }))).toBe(1);
  });

  it("AG-005: does NOT flag a forbidden pattern in an EXCLUDED path", () => {
    expect(runGate(fixture({ files: { "src/allowed/x.ts": `const x = "${TOKEN}";\n` } }))).toBe(0);
  });

  // ---- Waivers ------------------------------------------------------------
  it("AG-003: an explicit waiver suppresses the violation", () => {
    const r = fixture({
      files: { "src/bad.ts": `const x = "${TOKEN}";\n` },
      waivers: [waiverFor("src/bad.ts")],
    });
    expect(runGate(r)).toBe(0);
  });

  it("AG-004: an EXPIRED waiver does NOT suppress the violation", () => {
    const r = fixture({
      files: { "src/bad.ts": `const x = "${TOKEN}";\n` },
      waivers: [waiverFor("src/bad.ts", "2000-01-01")],
    });
    expect(runGate(r)).toBe(1);
  });

  // ---- Fail closed --------------------------------------------------------
  it("AG-006: fails CLOSED (exit 2) when the config is missing", () => {
    const r = fixture({ files: { "src/x.ts": "const x = 1;\n" }, withConfig: false });
    expect(runGate(r)).toBe(2);
  });

  // ---- The real repo ------------------------------------------------------
  it("AG-007: the real repo passes the mechanical gate", () => {
    expect(runGate(REPO)).toBe(0);
  });
});
