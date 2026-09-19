// Smoke coverage for scripts/ci/emit-guard-matrix.mjs (ADR-0047) — the generator that derives the two
// lint-arch matrices from each guard's `// ci-lane` marker so ci.yml no longer carries a hand-edited
// list. It is a GATE INPUT, so it must FAIL CLOSED: a guard with no/invalid lane, or an empty matrix
// lane (which would run zero guards and pass vacuously), must exit non-zero — never emit a silent
// partial matrix. It resolves scripts/ci from its own file location, so we COPY it (plus its
// ./_guard-lane.mjs dependency) into a throwaway fixture and run the copy against fixture guards.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const REAL = resolve(REPO, "scripts/ci/emit-guard-matrix.mjs");
const EMIT_SRC = readFileSync(REAL, "utf8");
const LANE_HELPER_SRC = readFileSync(resolve(REPO, "scripts/ci/_guard-lane.mjs"), "utf8");

afterAll(cleanupGuardFixtures);

function runEmit(root: string, args: string[] = []): { code: number; out: string } {
  try {
    const out = execFileSync("node", [resolve(root, "scripts/ci/emit-guard-matrix.mjs"), ...args], {
      encoding: "utf8",
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer | string };
    return { code: err.status ?? 1, out: String(err.stdout ?? "") };
  }
}

const BASE = {
  "scripts/ci/emit-guard-matrix.mjs": EMIT_SRC,
  "scripts/ci/_guard-lane.mjs": LANE_HELPER_SRC,
};

// A well-formed guard set: one of each lane so neither matrix lane is empty.
const VALID = {
  ...BASE,
  "scripts/ci/check-a.mjs": "// ci-lane: critical\n",
  "scripts/ci/check-b.mjs": "// ci-lane: standard\n",
  "scripts/ci/check-c.mjs": "// ci-lane: bespoke\n",
};

describe("emit-guard-matrix generator (smoke)", () => {
  it("EM-001: classifies guards by lane and exits 0", () => {
    const { code, out } = runEmit(guardFixture(VALID));
    expect(code).toBe(0);
    expect(out).toContain("critical=1");
    expect(out).toContain("standard=1");
    expect(out).toContain("bespoke=1");
  });

  it("EM-002: fails CLOSED (exit 2) when a guard declares no lane", () => {
    const { code } = runEmit(guardFixture({ ...VALID, "scripts/ci/check-x.mjs": "// no lane\n" }));
    expect(code).toBe(2);
  });

  it("EM-003: fails CLOSED (exit 2) on an invalid lane value", () => {
    const { code } = runEmit(
      guardFixture({ ...VALID, "scripts/ci/check-x.mjs": "// ci-lane: bogus\n" })
    );
    expect(code).toBe(2);
  });

  it("EM-004: fails CLOSED (exit 2) when the critical matrix lane is empty", () => {
    const { code } = runEmit(
      guardFixture({
        ...BASE,
        "scripts/ci/check-b.mjs": "// ci-lane: standard\n",
        "scripts/ci/check-c.mjs": "// ci-lane: bespoke\n",
      })
    );
    expect(code).toBe(2);
  });

  it("EM-005: fails CLOSED (exit 2) when the standard matrix lane is empty", () => {
    const { code } = runEmit(
      guardFixture({
        ...BASE,
        "scripts/ci/check-a.mjs": "// ci-lane: critical\n",
        "scripts/ci/check-c.mjs": "// ci-lane: bespoke\n",
      })
    );
    expect(code).toBe(2);
  });

  it("EM-006: --github-output emits critical= and standard= JSON arrays", () => {
    const { code, out } = runEmit(guardFixture(VALID), ["--github-output"]);
    expect(code).toBe(0);
    expect(out).toMatch(/^critical=\["check-a\.mjs"\]$/m);
    expect(out).toMatch(/^standard=\["check-b\.mjs"\]$/m);
  });

  it("EM-007: --lane critical prints just that lane's JSON array", () => {
    const { code, out } = runEmit(guardFixture(VALID), ["--lane", "critical"]);
    expect(code).toBe(0);
    expect(JSON.parse(out)).toEqual(["check-a.mjs"]);
  });

  it("EM-008: the real repo classifies cleanly (exit 0)", () => {
    try {
      execFileSync("node", [REAL], { cwd: REPO, stdio: "pipe" });
      expect(true).toBe(true);
    } catch (e) {
      throw new Error(
        "real-repo emit-guard-matrix failed: " + ((e as { stdout?: Buffer }).stdout ?? "")
      );
    }
  });
});
