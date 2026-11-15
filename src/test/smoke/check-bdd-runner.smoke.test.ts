// Smoke + discrimination coverage for scripts/ci/check-bdd-runner.mjs — the executable-Gherkin
// gate (docs/adr/20261110-gherkin-executable-runner.md, re-audit RP-G / BDD-1·BDD-2).
//
// The guard reconciles the committed BDD datastore (features/bdd-index.json + features/INDEX.md)
// against the repo's .feature files, and fails closed if the index drifts, an auth feature would
// execute, a feature has no declared audience, or the executable set is empty (vacuous green).
//
// This test (a) execs the REAL guard against the real repo so check-guard-has-test credits it, and
// (b) proves the gate actually DETECTS: a fixture whose committed index was tampered reds, and a
// fixture whose features are all @pending (empty executable set) reds. A neutralized guard
// (always exit 0) would make both discrimination cases fail — the verifiable-quality-gates property.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-bdd-runner.mjs");
const EMITTER = resolve(REPO, "scripts/ci/emit-bdd-index.mjs");

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

// Build a throwaway fixture repo containing the named real feature files (copied at their real
// relative paths so the hard-coded FEATURE_AUDIENCES map resolves), then generate a matching
// (non-stale) datastore into it. Returns the fixture root.
function makeFixture(featureRelPaths: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "bdd-fixture-"));
  tmps.push(root);
  for (const rel of featureRelPaths) {
    const dest = join(root, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(join(REPO, rel), "utf8"));
  }
  const env = { BDD_INDEX_ROOT: root };
  const json = execFileSync("node", [EMITTER, "--json"], { env: { ...process.env, ...env } }).toString();
  mkdirSync(join(root, "features"), { recursive: true });
  writeFileSync(join(root, "features/bdd-index.json"), json);
  // INDEX.md must list every feature path AND its status + `<exec> / <total>` count (the guard now
  // reconciles the human view too). Build a faithful row per feature from the generated datastore.
  const idx = JSON.parse(json) as {
    features: { path: string; status: string; scenarios: { executable: number; total: number } }[];
  };
  const rows = idx.features
    .map((f) => `| ${f.status} | ${f.scenarios.executable} / ${f.scenarios.total} | ${f.path} |`)
    .join("\n");
  writeFileSync(join(root, "features/INDEX.md"), "# fixture\n\n" + rows + "\n");
  return root;
}

describe("check-bdd-runner (smoke)", () => {
  it("BDD-R1: the real repo's datastore reconciles with the .feature files (exec'd directly so check-guard-has-test credits scripts/ci/check-bdd-runner.mjs)", () => {
    try {
      execFileSync("node", [GUARD], { cwd: REPO, stdio: "pipe" });
      expect(true).toBe(true);
    } catch (e) {
      throw new Error(
        "real-repo check-bdd-runner failed — the BDD datastore is out of sync: " +
          String((e as { stdout?: Buffer }).stdout ?? "")
      );
    }
  });

  it("BDD-R2: a fixture with an executable feature + a freshly generated index PASSES", () => {
    const root = makeFixture(["supabase/functions/_shared/html-to-text.feature"]);
    expect(run([GUARD], { BDD_INDEX_ROOT: root })).toBe(0);
  });

  it("BDD-R3: TAMPERING the committed index (stale datastore) makes the guard RED — proves drift detection", () => {
    const root = makeFixture(["supabase/functions/_shared/html-to-text.feature"]);
    const idx = join(root, "features/bdd-index.json");
    const obj = JSON.parse(readFileSync(idx, "utf8"));
    obj.totals.executable = 999; // a lie the feature files do not support
    writeFileSync(idx, JSON.stringify(obj, null, 2) + "\n");
    expect(run([GUARD], { BDD_INDEX_ROOT: root })).not.toBe(0);
  });

  it("BDD-R4: an ALL-PENDING fixture (empty executable set) makes the guard RED — proves the anti-vacuous-green check", () => {
    // figma-extract is @pending at the feature level → zero executable scenarios.
    const root = makeFixture(["supabase/functions/_shared/figma-extract.feature"]);
    expect(run([GUARD], { BDD_INDEX_ROOT: root })).not.toBe(0);
  });
});
