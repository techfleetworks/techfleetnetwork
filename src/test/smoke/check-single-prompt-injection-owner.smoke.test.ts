// Smoke + DISCRIMINATION coverage for scripts/ci/check-single-prompt-injection-owner.mjs
// (PROMPT-INJECTION-001; re-audit 2026-10-30 RH3·PAT-1; decisions.md §8 "one owner").
//
// The guard enforces that prompt-injection detection (OWASP LLM01) has exactly ONE owner
// (supabase/functions/_shared/prompt-injection.ts) and that no second copy — by name OR by the
// injection regex signature (a renamed copy) — is re-introduced under src/ or supabase/functions/.
// Each case builds a throwaway repo via guardFixture and runs the REAL guard with cwd = fixture
// root (the shared content-scan harness scopes to process.cwd()), asserting exit codes:
//   clean(owner+import)→0, named dup→1, second PATTERNS array→1, renamed regex copy→1,
//   owner missing→1, owner present-but-detector-stripped→1, missing root→2.
// If the guard stops detecting a second copy (neutralized), the dup/rename cases go GREEN and
// THIS TEST REDDENS — that is the discrimination contract (decisions.md §6; verifiable-quality-gates).
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-single-prompt-injection-owner.mjs");

afterAll(cleanupGuardFixtures);

const OWNER_REL = "supabase/functions/_shared/prompt-injection.ts";
const OWNER_SRC = [
  "export const PROMPT_INJECTION_PATTERNS = [/jailbreak/i, /system\\s*prompt/i];",
  "export function hasPromptInjection(s){ return PROMPT_INJECTION_PATTERNS.some(p => p.test(s)); }",
  "",
].join("\n");

/**
 * Build a fixture repo. `owner` controls the one-owner module; `extra` adds a second file
 * (path → contents). `roots` lists which top-level roots to create (default both). Run the guard
 * with cwd = root and return its exit code.
 */
function run(opts: {
  owner?: string | null; // null = do not create the owner file at all
  extra?: Record<string, string>;
  roots?: string[];
}): number {
  const { owner = OWNER_SRC, extra = {}, roots = ["src", "supabase/functions"] } = opts;
  const root = guardFixture({});
  for (const r of roots) mkdirSync(resolve(root, r), { recursive: true });
  if (owner !== null) {
    mkdirSync(resolve(root, "supabase/functions/_shared"), { recursive: true });
    writeFileSync(resolve(root, OWNER_REL), owner);
  }
  for (const [rel, content] of Object.entries(extra)) {
    const abs = resolve(root, rel);
    mkdirSync(resolve(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  try {
    execFileSync("node", [GUARD], { stdio: "pipe", cwd: root });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const IMPORT_USAGE =
  'import { hasPromptInjection } from "../_shared/prompt-injection.ts";\n' +
  "export const check = (x: string) => (hasPromptInjection(x) ? 400 : 200);\n";

describe("check-single-prompt-injection-owner guard (smoke + discrimination)", () => {
  it("PI-001: PASSES (0) the one owner plus an import/usage of it", () => {
    expect(run({ extra: { "src/lib/caller.ts": IMPORT_USAGE } })).toBe(0);
  });

  it("PI-002: FLAGS (1) a second copy declared BY NAME (function hasPromptInjection)", () => {
    expect(
      run({ extra: { "src/lib/dup.ts": "function hasPromptInjection(s: string){ return false; }\n" } })
    ).toBe(1);
  });

  it("PI-003: FLAGS (1) a second PROMPT_INJECTION_PATTERNS array", () => {
    expect(
      run({ extra: { "src/lib/dup.ts": "const PROMPT_INJECTION_PATTERNS = [/jailbreak/i];\n" } })
    ).toBe(1);
  });

  it("PI-004: FLAGS (1) a RENAMED copy caught by the injection regex signature", () => {
    expect(
      run({
        extra: {
          "supabase/functions/x/sniff.ts":
            "const sniff = [/ignore\\s+(all\\s+)?(previous|prior)\\s+instructions/i];\n",
        },
      })
    ).toBe(1);
  });

  it("PI-005: FLAGS (1) when the one owner is MISSING entirely (neutralized)", () => {
    expect(run({ owner: null })).toBe(1);
  });

  it("PI-006: FLAGS (1) when the owner exists but no longer defines the detector", () => {
    expect(run({ owner: "export const unrelated = 1;\n" })).toBe(1);
  });

  it("PI-007: fails CLOSED (2) when a scanned root is missing", () => {
    // Only create supabase/functions (+owner); src is absent → the harness fails closed.
    expect(run({ roots: ["supabase/functions"] })).toBe(2);
  });
});
