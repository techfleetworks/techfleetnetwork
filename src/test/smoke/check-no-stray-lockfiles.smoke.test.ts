// Smoke coverage for scripts/ci/check-no-stray-lockfiles.mjs — the guard that fails CI when a
// non-npm lockfile (bun.lock, bun.lockb, pnpm-lock.yaml, yarn.lock) is present at the repo root.
// npm (package-lock.json) is the ONE canonical package manager here: Cloudflare Pages auto-detects
// a foreign lockfile and builds production with the wrong tool — a single stray bun.lock (which bun
// uses but cannot reconcile with package.json `overrides`) froze the production frontend build for
// 11 days while GitHub CI (npm) stayed green. These tests run the REAL guard against fixtures and
// assert exit codes: a package-lock-only root passes, and each stray foreign lockfile fails.
//
// The guard checks existsSync() on RELATIVE lockfile names, i.e. relative to process.cwd() — so
// fixtures steer it purely by running the real guard with cwd = the fixture root. (This guard reads
// no directory, so it has no missing-dir fail-closed path; its only non-zero exit is a violation.)
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-no-stray-lockfiles.mjs");

afterAll(cleanupGuardFixtures);

/** Run the real guard with cwd=root; return exit code (0 clean, 1 violation). */
function runGuard(root: string): number {
  try {
    execFileSync("node", [GUARD], { cwd: root, stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("check-no-stray-lockfiles guard (smoke)", () => {
  it("LOCK-001: passes a root with only the canonical package-lock.json", () => {
    const r = guardFixture({
      "package.json": '{ "name": "x" }\n',
      "package-lock.json": '{ "lockfileVersion": 3 }\n',
    });
    expect(runGuard(r)).toBe(0);
  });

  it("LOCK-002: FLAGS a stray bun.lock at the root (the 11-day production-freeze incident)", () => {
    const r = guardFixture({
      "package-lock.json": '{ "lockfileVersion": 3 }\n',
      "bun.lock": "# bun lockfile\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("LOCK-003: FLAGS a stray yarn.lock at the root", () => {
    const r = guardFixture({
      "package-lock.json": '{ "lockfileVersion": 3 }\n',
      "yarn.lock": "# yarn lockfile v1\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("LOCK-004: FLAGS a stray pnpm-lock.yaml at the root", () => {
    const r = guardFixture({
      "package-lock.json": '{ "lockfileVersion": 3 }\n',
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("LOCK-005: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
