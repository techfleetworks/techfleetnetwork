// Smoke coverage for scripts/ci/check-edge-cors-trace.mjs — EDGE-CORS-TRACE-001, the guard that
// makes the invokeEdge → CORS drift structurally impossible: every edge function invoked from the
// browser via `invokeEdge(...)` must allow the `x-trace-id` preflight header (that wrapper attaches
// it to every call), or the browser blocks the POST with FunctionsFetchError and zero edge logs.
//
// The guard resolves its own paths from its file location (fileURLToPath), so we COPY it into a
// throwaway fixture repo and run the copy; the real guard is exec'd once (ECT-007) so
// check-guard-has-test credits it. Each violation/fail-closed scenario asserts a NON-zero exit tied
// to the guard's behavior, so the test reddens when the guard is no-op'd (discrimination gate).
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-edge-cors-trace.mjs");
const GUARD_SRC = readFileSync(GUARD, "utf8");

afterAll(cleanupGuardFixtures);

/** Run the copied guard at <root>/scripts/ci/check-edge-cors-trace.mjs; return its exit code. */
function runCopy(root: string): number {
  try {
    execFileSync("node", [resolve(root, "scripts/ci/check-edge-cors-trace.mjs")], {
      stdio: "pipe",
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const GUARD_FILE = { "scripts/ci/check-edge-cors-trace.mjs": GUARD_SRC };
// A compliant shared CORS owner (lists x-trace-id) — required for any non-fail-closed run.
const OWNER_OK =
  "export const corsHeaders = {\n" +
  '  "Access-Control-Allow-Origin": "*",\n' +
  '  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-trace-id, x-request-id",\n' +
  "};\n";
const INLINE_WITHOUT_TRACE =
  'const cors = { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };\n';

describe("check-edge-cors-trace guard (smoke)", () => {
  it("ECT-001: passes when the invoked function sources CORS from _shared/http.ts", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "supabase/functions/_shared/http.ts": OWNER_OK,
      "src/components/Foo.tsx": 'const d = await invokeEdge("foo", { body: {} });\n',
      "supabase/functions/foo/index.ts": 'import { corsHeaders } from "../_shared/http.ts";\n',
    });
    expect(runCopy(r)).toBe(0);
  });

  it("ECT-002: passes when the function's inline allow-list already contains x-trace-id", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "supabase/functions/_shared/http.ts": OWNER_OK,
      "src/components/Foo.tsx": 'await invokeEdge("foo");\n',
      "supabase/functions/foo/index.ts":
        'const cors = { "Access-Control-Allow-Headers": "authorization, content-type, x-trace-id" };\n',
    });
    expect(runCopy(r)).toBe(0);
  });

  it("ECT-003: FLAGS (exit 1) an invokeEdge target whose inline CORS omits x-trace-id", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "supabase/functions/_shared/http.ts": OWNER_OK,
      "src/components/Foo.tsx": 'await invokeEdge("foo", { body: {} });\n',
      "supabase/functions/foo/index.ts": INLINE_WITHOUT_TRACE,
    });
    expect(runCopy(r)).toBe(1);
  });

  it("ECT-004: also correlates sessionPort.invokeEdge(...) call sites", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "supabase/functions/_shared/http.ts": OWNER_OK,
      "src/features/auth/x.ts": 'const { data } = await sessionPort.invokeEdge("bar", { body });\n',
      "supabase/functions/bar/index.ts": INLINE_WITHOUT_TRACE,
    });
    expect(runCopy(r)).toBe(1);
  });

  it("ECT-005: fails CLOSED (exit 2) when the shared CORS owner itself omits x-trace-id", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "supabase/functions/_shared/http.ts":
        'export const corsHeaders = { "Access-Control-Allow-Headers": "authorization, content-type" };\n',
      "src/components/Foo.tsx": 'await invokeEdge("foo");\n',
      "supabase/functions/foo/index.ts": 'import { corsHeaders } from "../_shared/http.ts";\n',
    });
    expect(runCopy(r)).toBe(2);
  });

  it("ECT-006: fails CLOSED (exit 2) when supabase/functions is missing", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "src/components/Foo.tsx": 'await invokeEdge("foo");\n',
    });
    expect(runCopy(r)).toBe(2);
  });

  it("ECT-008: fails CLOSED (exit 2) when the owner names x-trace-id only in a comment, not the value", () => {
    const r = guardFixture({
      ...GUARD_FILE,
      "supabase/functions/_shared/http.ts":
        "// the allow-list must include x-trace-id — but this COMMENT is the only mention;\n" +
        'export const corsHeaders = { "Access-Control-Allow-Headers": "authorization, content-type" };\n',
      "src/components/Foo.tsx": 'await invokeEdge("foo");\n',
      "supabase/functions/foo/index.ts": 'import { corsHeaders } from "../_shared/http.ts";\n',
    });
    expect(runCopy(r)).toBe(2);
  });

  it("ECT-007: the real repo passes the guard", () => {
    try {
      execFileSync("node", [GUARD], { cwd: REPO, stdio: "pipe" });
      expect(true).toBe(true);
    } catch (e) {
      throw new Error(
        "real-repo check-edge-cors-trace failed: " + ((e as { stdout?: Buffer }).stdout ?? "")
      );
    }
  });
});
