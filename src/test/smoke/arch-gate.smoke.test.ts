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

  // ---- Discriminating coverage for the Welcome-Flow rules (ADR 20261009-welcome-flow-*) ----
  // The welcome dir is greenfield (no files exist yet), so each new rule globs to zero real
  // files and can only be proven by a fixture. These run the REAL arch-gate.config.json so the
  // specific welcome rules are proven to fire on a violation and stay quiet on the correct form.

  it("AG-011: welcome dir importing shadcn @/components/ui is flagged (DS-only)", () => {
    const r = fixture({
      config: REAL_CONFIG,
      files: {
        "src/components/welcome/WelcomeStep.tsx": `import { Button } from "@/components/ui/button";\n`,
      },
    });
    expect(runGate(r)).toBe(1);
  });

  it("AG-012: welcome dir importing lucide-react is flagged (DS-only)", () => {
    const r = fixture({
      config: REAL_CONFIG,
      files: {
        "src/components/welcome/Icon.tsx": `import { Check } from "lucide-react";\n`,
      },
    });
    expect(runGate(r)).toBe(1);
  });

  it("AG-013: welcome dir importing from @/design-system is clean (the correct form)", () => {
    const r = fixture({
      config: REAL_CONFIG,
      files: {
        "src/components/welcome/WelcomeStep.tsx": `import { Button, SvgIcon } from "@/design-system";\nconst done = profile.welcome_flow_completed_at != null;\n`,
      },
    });
    expect(runGate(r)).toBe(0);
  });

  it("AG-014: an object-literal write to welcome_flow_completed_at outside the owner is flagged", () => {
    const r = fixture({
      config: REAL_CONFIG,
      files: {
        // src/lib is not policed by the UI/service rules, so ONLY the single-writer rule can match here.
        "src/lib/bad-writer.ts": `export const payload = { welcome_flow_completed_at: new Date().toISOString() };\n`,
      },
    });
    expect(runGate(r)).toBe(1);
  });

  it("AG-015: reading profile.welcome_flow_completed_at (dot access) is clean", () => {
    const r = fixture({
      config: REAL_CONFIG,
      files: {
        "src/lib/ok-reader.ts": `export const isDone = (p) => p.welcome_flow_completed_at != null;\n`,
      },
    });
    expect(runGate(r)).toBe(0);
  });

  it("AG-016: an SVGR (ReactComponent) SVG import in the welcome dir is flagged (no-SVGR)", () => {
    const r = fixture({
      config: REAL_CONFIG,
      files: {
        "src/components/welcome/Hero.tsx": `import { ReactComponent as Hero } from "@/assets/welcome-flow/hero.svg";\n`,
      },
    });
    expect(runGate(r)).toBe(1);
  });

  it("AG-017: a welcome URL-import SVG (the fix) is clean", () => {
    const r = fixture({
      config: REAL_CONFIG,
      files: {
        "src/components/welcome/Hero.tsx": `import hero from "@/assets/welcome-flow/hero.svg";\nexport const H = () => <img src={hero} alt="Two teammates building together" />;\n`,
      },
    });
    expect(runGate(r)).toBe(0);
  });

  it("AG-018: reading a stored welcome_flow_stats counter table is flagged (live-stat rule)", () => {
    const r = fixture({
      config: REAL_CONFIG,
      files: {
        // In src/services, the UI-data rule does not apply, so ONLY the live-stat rule can match.
        "src/services/welcome-stat.service.ts": `const q = supabase.from("welcome_flow_stats").select("total").single();\n`,
      },
    });
    expect(runGate(r)).toBe(1);
  });

  it("AG-019: reading the live completion count via the owning RPC is clean (the fix)", () => {
    const r = fixture({
      config: REAL_CONFIG,
      files: {
        "src/services/welcome-stat.service.ts": `const q = supabase.rpc("get_welcome_flow_completion_count");\n`,
      },
    });
    expect(runGate(r)).toBe(0);
  });
});
