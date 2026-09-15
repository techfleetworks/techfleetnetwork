// Smoke coverage for scripts/ci/check-no-inline-cors.mjs — NO-INLINE-CORS-001, the guard that makes
// hand-rolled edge-function CORS structurally impossible: every function that sets
// Access-Control-Allow-Headers must import CORS from ../_shared/http.ts (which lists x-trace-id), so
// a function cannot carry a latent inline-CORS bomb that fails preflight the day its client migrates
// to invokeEdge. Shrink-only grandfather for the pre-existing backlog.
//
// The guard resolves its own paths from its file location, so we COPY it into a throwaway fixture
// repo and run the copy; the base allowlist is supplied via the NO_INLINE_CORS_BASE seam so the
// shrink check is deterministic without a git repo. The real guard is exec'd once (NIC-008) so
// check-guard-has-test credits it. Each scenario ties a specific exit code to the guard's behavior,
// so the test reddens if the guard is no-op'd (discrimination gate).
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-no-inline-cors.mjs");
const GUARD_SRC = readFileSync(GUARD, "utf8");
const GUARD_FILE = { "scripts/ci/check-no-inline-cors.mjs": GUARD_SRC };

afterAll(cleanupGuardFixtures);

/** Run the copied guard with the base allowlist pinned to a fixture file (bypasses git). */
function runCopy(root: string, base: string[]): number {
  const basePath = resolve(root, ".base.json");
  writeFileSync(basePath, JSON.stringify(base));
  try {
    execFileSync("node", [resolve(root, "scripts/ci/check-no-inline-cors.mjs")], {
      stdio: "pipe",
      env: { ...process.env, NO_INLINE_CORS_BASE: basePath },
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const IMPORTS_OWNER =
  'import { corsHeaders } from "../_shared/http.ts";\nexport default corsHeaders;\n';
const INLINE =
  'const cors = { "Access-Control-Allow-Headers": "authorization, content-type" };\nexport default cors;\n';
// Imports the owner AND extends it for a bespoke header (send-community-agreement-trigger shape).
const MERGE =
  'import { corsHeaders as s } from "../_shared/http.ts";\n' +
  'const cors = { ...s, "Access-Control-Allow-Headers": `${s["Access-Control-Allow-Headers"]}, x-internal-secret` };\n' +
  "export default cors;\n";
const AL = (fns: string[]) => JSON.stringify({ functions: fns });

describe("check-no-inline-cors guard (smoke)", () => {
  it("NIC-001: passes when every function sources CORS from the shared owner", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "scripts/ci/no-inline-cors-grandfather.json": AL([]),
      "supabase/functions/foo/index.ts": IMPORTS_OWNER,
      "supabase/functions/bar/index.ts": IMPORTS_OWNER,
    });
    expect(runCopy(r, [])).toBe(0);
  });

  it("NIC-002: passes a grandfathered inline-CORS function", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "scripts/ci/no-inline-cors-grandfather.json": AL(["foo"]),
      "supabase/functions/foo/index.ts": INLINE,
    });
    expect(runCopy(r, ["foo"])).toBe(0);
  });

  it("NIC-003: FLAGS (exit 1) a new inline-CORS function not on the allowlist", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "scripts/ci/no-inline-cors-grandfather.json": AL([]),
      "supabase/functions/foo/index.ts": INLINE,
    });
    expect(runCopy(r, [])).toBe(1);
  });

  it("NIC-004: FLAGS (exit 1) growing the grandfather allowlist vs base", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "scripts/ci/no-inline-cors-grandfather.json": AL(["foo", "bar"]),
      "supabase/functions/foo/index.ts": INLINE,
      "supabase/functions/bar/index.ts": INLINE,
    });
    expect(runCopy(r, ["foo"])).toBe(1); // base listed only foo; bar is a forbidden new entry
  });

  it("NIC-005: FLAGS (exit 1) a stale grandfather entry (function already migrated)", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "scripts/ci/no-inline-cors-grandfather.json": AL(["foo"]),
      "supabase/functions/foo/index.ts": IMPORTS_OWNER, // compliant now → must be removed
    });
    expect(runCopy(r, ["foo"])).toBe(1);
  });

  it("NIC-006: passes a function that extends the shared set for a bespoke header", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "scripts/ci/no-inline-cors-grandfather.json": AL([]),
      "supabase/functions/foo/index.ts": MERGE,
    });
    expect(runCopy(r, [])).toBe(0);
  });

  it("NIC-007: fails CLOSED (exit 2) when supabase/functions is missing", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "scripts/ci/no-inline-cors-grandfather.json": AL([]),
    });
    expect(runCopy(r, [])).toBe(2);
  });

  it("NIC-009: FLAGS (exit 1) a function that imports the owner but still hard-codes a literal allow-list", () => {
    // Blind-spot closure: importing jsonResponse/errorResponse from the owner must NOT excuse a
    // hand-rolled plain-literal Access-Control-Allow-Headers.
    const r = guardFixture({
      ...GUARD_FILE,
      "scripts/ci/no-inline-cors-grandfather.json": AL([]),
      "supabase/functions/foo/index.ts":
        'import { jsonResponse } from "../_shared/http.ts";\n' +
        'const cors = { "Access-Control-Allow-Headers": "authorization, content-type" };\n' +
        "export default { cors, jsonResponse };\n",
    });
    expect(runCopy(r, [])).toBe(1);
  });

  it("NIC-008: the real repo passes the guard (invariant + no stale entries)", () => {
    // Pin the shrink baseline to the repo's OWN grandfather (self-compare → no growth) so this runs
    // in any checkout depth. The guard's real CI home is gate-verify (fetch-depth: 0), where the
    // vs-main git path runs; the vitest job that runs this smoke test does a shallow checkout, so we
    // exercise the invariant + stale-entry checks against the real supabase/functions here, not git.
    try {
      execFileSync("node", [GUARD], {
        cwd: REPO,
        stdio: "pipe",
        env: {
          ...process.env,
          NO_INLINE_CORS_BASE: resolve(REPO, "scripts/ci/no-inline-cors-grandfather.json"),
        },
      });
      expect(true).toBe(true);
    } catch (e) {
      throw new Error(
        "real-repo check-no-inline-cors failed: " + ((e as { stdout?: Buffer }).stdout ?? "")
      );
    }
  });
});
