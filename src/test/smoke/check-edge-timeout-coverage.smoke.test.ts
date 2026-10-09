// Smoke coverage for scripts/ci/check-edge-timeout-coverage.mjs — EDGE-TIMEOUT-COVERAGE-001, the
// guard that makes the invokeEdge → 8s-default drift structurally impossible: every browser-invoked
// edge function that calls the Discord API via `discordFetch` must declare a client timeout budget
// in src/lib/edge/edge-timeouts.ts, or the browser aborts the call mid-flight under Discord rate-
// limiting (the exact failure that broke the Discord-connect invite flow).
//
// The guard resolves its own paths from its file location (fileURLToPath), so we COPY it into a
// throwaway fixture repo and run the copy. The real guard is exec'd once (ETC-007) so
// check-guard-has-test credits it. Each violation/fail-closed scenario asserts a NON-zero exit tied
// to the guard's behavior, so the test reddens when the guard is no-op'd (discrimination gate).
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-edge-timeout-coverage.mjs");
const GUARD_SRC = readFileSync(GUARD, "utf8");

afterAll(cleanupGuardFixtures);

/** Run the copied guard at <root>/scripts/ci/check-edge-timeout-coverage.mjs; return its exit code. */
function runCopy(root: string): number {
  try {
    execFileSync("node", [resolve(root, "scripts/ci/check-edge-timeout-coverage.mjs")], {
      stdio: "pipe",
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const GUARD_FILE = { "scripts/ci/check-edge-timeout-coverage.mjs": GUARD_SRC };
const REGISTRY_WITH_FOO =
  "export const EDGE_FUNCTION_TIMEOUTS_MS = {\n" + '  "foo": 15_000,\n' + "};\n";
const REGISTRY_WITHOUT_FOO =
  "export const EDGE_FUNCTION_TIMEOUTS_MS = {\n" + '  "other-fn": 12_000,\n' + "};\n";
const REGISTRY_EMPTY = "export const EDGE_FUNCTION_TIMEOUTS_MS = {};\n";
const USES_DISCORD_FETCH =
  'import { discordFetch } from "../_shared/discord-fetch.ts";\nawait discordFetch("x");\n';
const NO_DISCORD_FETCH = 'export const handler = () => new Response("ok");\n';

describe("check-edge-timeout-coverage guard (smoke)", () => {
  it("ETC-001: passes when a browser-invoked discordFetch function is registered", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "src/lib/edge/edge-timeouts.ts": REGISTRY_WITH_FOO,
      "src/components/Foo.tsx": 'const d = await invokeEdge("foo", { body: {} });\n',
      "supabase/functions/foo/index.ts": USES_DISCORD_FETCH,
    });
    expect(runCopy(r)).toBe(0);
  });

  it("ETC-002: FLAGS (exit 1) a browser-invoked discordFetch function that is NOT registered", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "src/lib/edge/edge-timeouts.ts": REGISTRY_WITHOUT_FOO,
      "src/components/Foo.tsx": 'await invokeEdge("foo", { body: {} });\n',
      "supabase/functions/foo/index.ts": USES_DISCORD_FETCH,
    });
    expect(runCopy(r)).toBe(1);
  });

  it("ETC-003: ignores a browser-invoked function that does NOT use discordFetch (8s default is fine)", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "src/lib/edge/edge-timeouts.ts": REGISTRY_WITHOUT_FOO,
      "src/components/Foo.tsx": 'await invokeEdge("foo", { body: {} });\n',
      "supabase/functions/foo/index.ts": NO_DISCORD_FETCH,
    });
    expect(runCopy(r)).toBe(0);
  });

  it("ETC-004: detects discordFetch used from a helper file in the function dir", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "src/lib/edge/edge-timeouts.ts": REGISTRY_WITHOUT_FOO,
      "src/components/Foo.tsx": 'await invokeEdge("foo");\n',
      "supabase/functions/foo/index.ts": 'import { work } from "./work.ts";\n',
      "supabase/functions/foo/work.ts": USES_DISCORD_FETCH,
    });
    expect(runCopy(r)).toBe(1);
  });

  it("ETC-005: fails closed (exit 1) when the registry parses to zero keys", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "src/lib/edge/edge-timeouts.ts": REGISTRY_EMPTY,
      "src/components/Foo.tsx": 'await invokeEdge("foo");\n',
      "supabase/functions/foo/index.ts": USES_DISCORD_FETCH,
    });
    expect(runCopy(r)).toBe(1);
  });

  it("ETC-006: fails closed (exit 2) when the timeout registry file is missing", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "src/components/Foo.tsx": 'await invokeEdge("foo");\n',
      "supabase/functions/foo/index.ts": USES_DISCORD_FETCH,
    });
    expect(runCopy(r)).toBe(2);
  });

  it("ETC-007: the real, shipped guard passes against this repo", () => {
    // Exec the actual guard (not a copy) so check-guard-has-test credits this test, and so a
    // regression that leaves a real discordFetch function unregistered reddens here too.
    let code = 0;
    try {
      execFileSync("node", [GUARD], { stdio: "pipe" });
    } catch (e) {
      code = (e as { status?: number }).status ?? 1;
    }
    expect(code).toBe(0);
  });
});
