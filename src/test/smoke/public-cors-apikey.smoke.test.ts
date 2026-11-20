// PUB-CORS-001: every public-* edge gateway must allow the `apikey` request header.
//
// The logged-out catalog pages call the public gateways via a RAW fetch
// (src/hooks/use-public-catalog.ts → getJson), which sends `apikey` +
// `content-type`. A hand-rolled Access-Control-Allow-Headers that omits `apikey`
// still answers the OPTIONS preflight 200, but the browser REJECTS the preflight
// and blocks the GET with a CORS error — the tab then shows "could not load".
// That was the public-classes bug (2026-11-19): its inline list allowed only
// "content-type". This test locks the invariant so it cannot regress.
//
// Compliant = the gateway sources CORS from _shared/http.ts (whose
// ALLOWED_REQUEST_HEADERS lists apikey + x-trace-id) OR declares an inline
// Access-Control-Allow-Headers that includes apikey. These gateways are reached by
// raw fetch, not invokeEdge, so check-edge-cors-trace.mjs (invokeEdge-only) does
// not cover them — hence this test.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const FUNCS = join(process.cwd(), "supabase", "functions");

function publicGateways(): string[] {
  return readdirSync(FUNCS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("public-"))
    .map((e) => e.name)
    .filter((n) => existsSync(join(FUNCS, n, "index.ts")));
}

/** True when the function's CORS allows the `apikey` request header. */
export function corsAllowsApikey(src: string): boolean {
  // Sources CORS from the shared owner (http.ts lists apikey) → compliant.
  if (/from\s+["'][^"']*_shared\/http\.ts["']/.test(src)) return true;
  // Otherwise every inline Access-Control-Allow-Headers it declares must list apikey.
  const inline = [...src.matchAll(/["']Access-Control-Allow-Headers["']\s*:\s*(["'`])([\s\S]*?)\1/gi)];
  return inline.length > 0 && inline.every((m) => m[2].toLowerCase().includes("apikey"));
}

describe("public-* edge gateways allow the apikey CORS header (PUB-CORS-001)", () => {
  const gateways = publicGateways();

  it("discovers the public gateways (fail-closed if none found)", () => {
    expect(gateways.length).toBeGreaterThan(0);
  });

  for (const fn of gateways) {
    it(`${fn}: CORS allows apikey (shared http.ts or inline list)`, () => {
      const src = readFileSync(join(FUNCS, fn, "index.ts"), "utf8");
      expect(corsAllowsApikey(src)).toBe(true);
    });
  }

  it("DISCRIMINATING: an inline allow-headers without apikey is caught", () => {
    // The exact shape of the public-classes bug must be detected, and the fix accepted.
    expect(corsAllowsApikey(`const c = { "Access-Control-Allow-Headers": "content-type" };`)).toBe(false);
    expect(corsAllowsApikey(`const c = { "Access-Control-Allow-Headers": "apikey, content-type" };`)).toBe(true);
    expect(corsAllowsApikey(`import { handleCors } from "../_shared/http.ts";`)).toBe(true);
    // A gateway with no CORS declaration at all is non-compliant (can't be anon-fetched).
    expect(corsAllowsApikey(`export const x = 1;`)).toBe(false);
  });
});
