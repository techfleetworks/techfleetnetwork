// Smoke coverage for scripts/ci/check-edge-function-coverage.mjs — a zero-tolerance guard that
// fails CI when an edge function under supabase/functions/ is NOT pinned with a
// [functions.<name>] block in supabase/config.toml (an unpinned function ships with an
// unintended verify_jwt posture), or when a function's // @edge-public|cron magic comment
// CONTRADICTS its config verify_jwt (a public/cron surface stuck behind the platform JWT gate
// rejects the anonymous / service-role callers it must serve). It also regenerates the
// functions manifest as a side effect. All inputs are read from process.cwd(), so we steer it
// with cwd=fixtureRoot. These tests prove it CATCHES an unpinned function and a magic-comment
// contradiction, and fails CLOSED when config.toml is missing.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-edge-function-coverage.mjs");

const CONFIG = "supabase/config.toml";
const FOO_INDEX = "supabase/functions/foo/index.ts";

afterAll(cleanupGuardFixtures);

/** Run the real guard with cwd=root; return exit code (0 clean, 1 violation / fail-closed). */
function runGuard(root: string): number {
  try {
    execFileSync("node", [GUARD], { cwd: root, stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("check-edge-function-coverage guard (smoke)", () => {
  it("EFC-001: passes when every function dir is pinned + declares its edge-auth kind", () => {
    const r = guardFixture({
      [CONFIG]: "[functions.foo]\n    verify_jwt = true\n",
      [FOO_INDEX]: "// @edge-auth required\nexport default 1;\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("EFC-002: FLAGS (exit 1) a function dir with no [functions.<name>] block in config.toml", () => {
    const r = guardFixture({
      [CONFIG]: "# no functions pinned\n",
      [FOO_INDEX]: "// @edge-auth required\nexport default 1;\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("EFC-003: FLAGS (exit 1) an @edge-public function that config.toml gates with verify_jwt=true", () => {
    const r = guardFixture({
      [CONFIG]: "[functions.foo]\n    verify_jwt = true\n",
      [FOO_INDEX]: "// @edge-public\nexport default 1;\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("EFC-004: fails CLOSED (exit 1) when supabase/config.toml is missing", () => {
    const r = guardFixture({ [FOO_INDEX]: "// @edge-auth required\nexport default 1;\n" });
    expect(runGuard(r)).toBe(1);
  });

  it("EFC-005: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
