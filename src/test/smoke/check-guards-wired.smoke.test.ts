// Smoke coverage for scripts/ci/check-guards-wired.mjs — GUARDS-WIRED-001, the meta-check that makes
// "a committed guard runs nowhere" (the ADR-0024 gap) structurally impossible. Since ADR-0047 the
// model is LANE-BASED: every scripts/ci/check-*.mjs must self-declare `// ci-lane: critical|standard|
// bespoke`; critical/standard ride the DERIVED lint-arch matrices (so they are wired by construction),
// while bespoke guards must have their own live workflow step. The derivation itself (emit-guard-matrix)
// must be wired, or every matrix guard would run nowhere.
//
// The guard resolves its own paths from its file location (fileURLToPath), so we COPY it into a
// throwaway fixture repo and run the copy; the real guard is exec'd once for the real-repo pass so
// check-guard-has-test credits it.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-guards-wired.mjs");
const GUARD_SRC = readFileSync(GUARD, "utf8");
// The guard imports ./_json.mjs (BOM-tolerant reader) and ./_guard-lane.mjs (the lane parser); the
// copy must include both so the relative imports resolve in the throwaway fixture.
const JSON_HELPER_SRC = readFileSync(resolve(REPO, "scripts/ci/_json.mjs"), "utf8");
const LANE_HELPER_SRC = readFileSync(resolve(REPO, "scripts/ci/_guard-lane.mjs"), "utf8");

afterAll(cleanupGuardFixtures);

/** Run the guard at <root>/scripts/ci/check-guards-wired.mjs (a copy); return its exit code. */
function runCopy(root: string): number {
  try {
    execFileSync("node", [resolve(root, "scripts/ci/check-guards-wired.mjs")], { stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

// A workflow that WIRES the matrix generator — required for any non-fail-closed case.
const WF_WITH_GENERATOR =
  "jobs:\n  gm:\n    steps:\n      - run: node scripts/ci/emit-guard-matrix.mjs --github-output\n";

// Every fixture allowlists the copied meta-guard itself (it is `ci-lane: bespoke` and would otherwise
// need its own step) so only the TEST guard drives the result.
const BASE = {
  "scripts/ci/check-guards-wired.mjs": GUARD_SRC,
  "scripts/ci/_json.mjs": JSON_HELPER_SRC,
  "scripts/ci/_guard-lane.mjs": LANE_HELPER_SRC,
  "scripts/ci/guards-wired-allowlist.json": '["check-guards-wired.mjs"]',
};

describe("check-guards-wired meta-check (smoke)", () => {
  it("GW-001: passes a critical/standard guard (rides the derived matrix — no per-guard step)", () => {
    const r = guardFixture({
      ...BASE,
      "scripts/ci/check-foo.mjs": "// ci-lane: standard\n// a guard\n",
      ".github/workflows/ci.yml": WF_WITH_GENERATOR,
    });
    expect(runCopy(r)).toBe(0);
  });

  it("GW-002: FLAGS (exit 1) a guard that declares NO ci-lane", () => {
    const r = guardFixture({
      ...BASE,
      "scripts/ci/check-foo.mjs": "// a guard with no lane\n",
      ".github/workflows/ci.yml": WF_WITH_GENERATOR,
    });
    expect(runCopy(r)).toBe(1);
  });

  it("GW-003: FLAGS (exit 1) a bespoke guard with no live workflow step", () => {
    const r = guardFixture({
      ...BASE,
      "scripts/ci/check-foo.mjs": "// ci-lane: bespoke\n",
      ".github/workflows/ci.yml": WF_WITH_GENERATOR, // wires the generator but NOT check-foo
    });
    expect(runCopy(r)).toBe(1);
  });

  it("GW-004: passes a bespoke guard that HAS its own live step", () => {
    const r = guardFixture({
      ...BASE,
      "scripts/ci/check-foo.mjs": "// ci-lane: bespoke\n",
      ".github/workflows/ci.yml":
        "jobs:\n  x:\n    steps:\n      - run: node scripts/ci/emit-guard-matrix.mjs\n      - run: node scripts/ci/check-foo.mjs\n",
    });
    expect(runCopy(r)).toBe(0);
  });

  it("GW-005: FLAGS (exit 1) an invalid ci-lane value", () => {
    const r = guardFixture({
      ...BASE,
      "scripts/ci/check-foo.mjs": "// ci-lane: bogus\n",
      ".github/workflows/ci.yml": WF_WITH_GENERATOR,
    });
    expect(runCopy(r)).toBe(1);
  });

  it("GW-006: an unwired bespoke guard on the shrink-only allowlist is allowed (exit 0)", () => {
    const r = guardFixture({
      ...BASE,
      "scripts/ci/guards-wired-allowlist.json": '["check-guards-wired.mjs","check-foo.mjs"]',
      "scripts/ci/check-foo.mjs": "// ci-lane: bespoke\n",
      ".github/workflows/ci.yml": WF_WITH_GENERATOR, // check-foo has no step, but it is allowlisted
    });
    expect(runCopy(r)).toBe(0);
  });

  it("GW-007: fails CLOSED (exit 2) when the matrix generator is wired by no workflow", () => {
    const r = guardFixture({
      ...BASE,
      "scripts/ci/check-foo.mjs": "// ci-lane: standard\n",
      ".github/workflows/ci.yml": "jobs:\n  x:\n    steps:\n      - run: echo nothing\n",
    });
    expect(runCopy(r)).toBe(2);
  });

  it("GW-008: fails CLOSED (exit 2) when there is no .github/workflows dir", () => {
    const r = guardFixture({
      ...BASE,
      "scripts/ci/check-foo.mjs": "// ci-lane: standard\n",
      "README.md": "no workflows dir",
    });
    expect(runCopy(r)).toBe(2);
  });

  it("GW-009: a bespoke guard named only in a YAML comment is NOT wired (exit 1)", () => {
    const r = guardFixture({
      ...BASE,
      "scripts/ci/check-foo.mjs": "// ci-lane: bespoke\n",
      ".github/workflows/ci.yml":
        "jobs:\n  x:\n    steps:\n      - run: node scripts/ci/emit-guard-matrix.mjs\n      # - run: node scripts/ci/check-foo.mjs (disabled)\n      - run: echo nothing\n",
    });
    expect(runCopy(r)).toBe(1);
  });

  it("GW-010: the real repo passes the guard", () => {
    try {
      execFileSync("node", [GUARD], { cwd: REPO, stdio: "pipe" });
      expect(true).toBe(true);
    } catch (e) {
      throw new Error(
        "real-repo check-guards-wired failed: " + ((e as { stdout?: Buffer }).stdout ?? "")
      );
    }
  });
});
