// Smoke coverage for scripts/ci/check-erasure-completeness.mjs — ERASURE-COMPLETENESS-001
// (docs/adr/20261106-erasure-completeness-registry.md, supersedes ADR-0039's hand list).
//
// The guard proves LOCAL right-to-erasure completeness: every PII-bearing table (schema-derived)
// is either erased/de-identified in the winning handle_user_deletion(), cascade-covered, or
// registered in scripts/ci/pii-tables.json with a reason. The discrimination scenarios live in
// the node-runnable harness scripts/ci/erasure-completeness-selftest.mjs (so they can be proven
// without the Vitest/Deno toolchain); this smoke test runs that harness in CI, execs the real
// guard once so check-guard-has-test credits it, and proves the harness itself reddens when the
// guard is neutralized (the mutation/discrimination property, verifiable-quality-gates).
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-erasure-completeness.mjs");
const SELFTEST = resolve(REPO, "scripts/ci/erasure-completeness-selftest.mjs");

const tmps: string[] = [];
afterAll(() => {
  for (const t of tmps) rmSync(t, { recursive: true, force: true });
});

function run(args: string[], env?: NodeJS.ProcessEnv): number {
  try {
    execFileSync("node", args, { stdio: "pipe", env: { ...process.env, ...env } });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("check-erasure-completeness (smoke)", () => {
  it("EC-001: the discrimination harness passes against the real guard (9 scenarios: reds on an unregistered PII table, a lying/stale registry, a reasonless allow-list entry; fails closed on zero-scan)", () => {
    expect(run([SELFTEST])).toBe(0);
  });

  it("EC-002: the real repo's PII surface reconciles with handle_user_deletion() (exec'd directly so check-guard-has-test credits scripts/ci/check-erasure-completeness.mjs)", () => {
    try {
      execFileSync("node", [GUARD], { cwd: REPO, stdio: "pipe" });
      expect(true).toBe(true);
    } catch (e) {
      throw new Error(
        "real-repo check-erasure-completeness failed — an erasure/registry gap exists: " +
          ((e as { stdout?: Buffer }).stdout ?? "")
      );
    }
  });

  it("EC-003: NEUTRALIZING the guard (replace it with a no-op exit 0) makes the harness FAIL — proves the gate actually detects", () => {
    const dir = mkdtempSync(join(tmpdir(), "erasure-noop-"));
    tmps.push(dir);
    const noop = join(dir, "noop-gate.mjs");
    writeFileSync(noop, "process.exit(0);\n");
    expect(run([SELFTEST], { ERASURE_GATE_OVERRIDE: noop })).not.toBe(0);
  });
});
