// Smoke coverage for scripts/ci/arch-gate.mjs — the flagship MECHANICAL architecture gate
// (the deterministic half of the blocking arch gate; judge-arch is the review half). It is
// cwd-based (ROOT = process.cwd()) and reads arch-gate.config.json + arch-gate.waivers.json
// from ROOT, so we run the REAL engine against throwaway fixture repos and assert exit codes.
// "Guard the guard": the engine that enforces every structural rule must itself be proven.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
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

// Default to a valid FUTURE date: an undated waiver is now rejected fail-closed (AG-011), so a
// suppressing waiver must carry a real expiry.
const waiverFor = (path: string, expires = "2099-01-01") => ({
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

  // ---- Waiver hygiene: no permanent (undated) waivers (audit 2026-10) ------
  it("AG-011: fails CLOSED (exit 2) on a waiver with an empty `expires` (permanent bypass forbidden)", () => {
    const r = fixture({
      files: { "src/bad.ts": `const x = "${TOKEN}";\n` },
      waivers: [waiverFor("src/bad.ts", "")],
    });
    expect(runGate(r)).toBe(2);
  });

  it("AG-012: fails CLOSED (exit 2) on a waiver whose `expires` is not a parseable date", () => {
    const r = fixture({
      files: { "src/bad.ts": `const x = "${TOKEN}";\n` },
      waivers: [waiverFor("src/bad.ts", "someday")],
    });
    expect(runGate(r)).toBe(2);
  });

  // ---- The real repo ------------------------------------------------------
  it("AG-007: the real repo passes the mechanical gate", () => {
    expect(runGate(REPO)).toBe(0);
  });

  // ---- Discriminating coverage for the projects select('*') rule (ADR-0065) ----
  // Runs the REAL arch-gate.config.json (not the generic fixture rule) so the specific
  // "projects reads use explicit columns, never select('*')" rule is proven to fire on the
  // regression and stay quiet on the fix. Fixtures live in src/services/** so ONLY this rule can
  // match (the "UI must not access the database directly" rule covers pages/components only).
  const REAL_CONFIG = JSON.parse(readFileSync(resolve(REPO, "arch-gate.config.json"), "utf8"));

  it("AG-008: real config flags a single-line projects.select('*')", () => {
    const r = fixture({
      config: REAL_CONFIG,
      files: {
        "src/services/x.service.ts": `const q = supabase.from("projects").select("*").eq("id", id);\n`,
      },
    });
    expect(runGate(r)).toBe(1);
  });

  it("AG-009: real config flags a MULTILINE projects.from(...).select('*') chain", () => {
    const r = fixture({
      config: REAL_CONFIG,
      files: {
        "src/services/y.service.ts": `const q = await supabase\n  .from("projects")\n  .select("*, clients(name)")\n  .single();\n`,
      },
    });
    expect(runGate(r)).toBe(1);
  });

  it("AG-010: real config does NOT flag an explicit-column projects select (the fix)", () => {
    const r = fixture({
      config: REAL_CONFIG,
      files: {
        "src/services/z.service.ts": `const q = supabase.from("projects").select("id, project_type, phase, is_shipathon").in("id", ids);\n`,
      },
    });
    expect(runGate(r)).toBe(0);
  });
});
