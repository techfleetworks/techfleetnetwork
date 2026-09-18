// Smoke coverage for scripts/ci/check-db-schema-allowlist-shrinks.mjs — DB-SCHEMA-ALLOWLIST-SHRINK-001.
// The ADR-0036 drift allowlist (db-schema-allowlist.json) waives objects the schema gate would else
// verify against prod, so it must be SHRINK-ONLY *mechanically* (decisions.md §6), not by prose. This
// guard requires each category's waiver count to EQUAL a committed cap: count>cap (a waiver was added)
// and count<cap (burn-down, cap not lowered) both FAIL; only an at-cap allowlist passes. These
// scenarios pin exactly that + the fail-closed paths.
//
// The guard resolves its own paths from its file location, so we COPY it (+ its ./_json.mjs dependency)
// into a throwaway fixture repo and run the copy against a fixture allowlist; the real guard is exec'd
// once (SHRINK-006) so check-guard-has-test credits it and we prove the real repo is at-cap.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-db-schema-allowlist-shrinks.mjs");
const GUARD_SRC = readFileSync(GUARD, "utf8");
const JSON_HELPER_SRC = readFileSync(resolve(REPO, "scripts/ci/_json.mjs"), "utf8");

afterAll(cleanupGuardFixtures);

function runCopy(root: string): number {
  try {
    execFileSync("node", [resolve(root, "scripts/ci/check-db-schema-allowlist-shrinks.mjs")], {
      stdio: "pipe",
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const BASE = {
  "scripts/ci/check-db-schema-allowlist-shrinks.mjs": GUARD_SRC,
  "scripts/ci/_json.mjs": JSON_HELPER_SRC,
  "readme.md": "x",
};

// An allowlist whose per-category counts EXACTLY equal the guard's committed CAPS.
const AT_CAP = {
  table: ["a", "b"],
  type: ["a", "b"],
  rls_enabled: ["a", "b"],
  index: ["a", "b"],
  trigger: ["a", "b"],
  column: ["a", "b", "c", "d", "e"],
  policy: ["a"],
};
const allowFile = (obj: unknown) => ({
  "scripts/ci/db-schema-allowlist.json": JSON.stringify(obj),
});

describe("check-db-schema-allowlist-shrinks (smoke)", () => {
  it("SHRINK-001: passes when every category is exactly at its cap", () => {
    expect(runCopy(guardFixture({ ...BASE, ...allowFile(AT_CAP) }))).toBe(0);
  });

  it("SHRINK-002: FLAGS (exit 1) when a category exceeds its cap — a waiver was ADDED without a cap bump", () => {
    expect(
      runCopy(guardFixture({ ...BASE, ...allowFile({ ...AT_CAP, policy: ["a", "b"] }) }))
    ).toBe(1);
  });

  it("SHRINK-003: FLAGS (exit 1) when a category is UNDER its cap — burn-down without lowering the cap", () => {
    expect(
      runCopy(guardFixture({ ...BASE, ...allowFile({ ...AT_CAP, column: ["a", "b", "c", "d"] }) }))
    ).toBe(1);
  });

  it("SHRINK-004: fails CLOSED (exit 2) when the allowlist file is absent", () => {
    expect(runCopy(guardFixture({ ...BASE }))).toBe(2);
  });

  it("SHRINK-005: fails CLOSED (exit 2) when a waived category has no cap (uncapped ratchet)", () => {
    expect(runCopy(guardFixture({ ...BASE, ...allowFile({ ...AT_CAP, bogus: ["x"] }) }))).toBe(2);
  });

  it("SHRINK-006: the real repo's allowlist is exactly at its shrink cap", () => {
    try {
      execFileSync("node", [GUARD], { cwd: REPO, stdio: "pipe" });
      expect(true).toBe(true);
    } catch (e) {
      throw new Error(
        "real-repo check-db-schema-allowlist-shrinks failed — db-schema-allowlist.json and CAPS are out of lockstep: " +
          ((e as { stdout?: Buffer }).stdout ?? "")
      );
    }
  });
});
