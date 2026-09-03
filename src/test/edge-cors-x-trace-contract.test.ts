import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression cover for the Recruiting Center CORS outage.
 *
 * The frontend `invokeEdge` wrapper attaches an `x-trace-id` request header to every call,
 * so a browser-invoked edge function must source its CORS from the shared owner
 * `_shared/http.ts` (which lists `x-trace-id` / `x-request-id`) rather than a hand-rolled
 * `Access-Control-Allow-Headers` list that omits it — otherwise the browser rejects the
 * preflight and supabase-js throws `FunctionsFetchError` ("Failed to send a request to the
 * Edge Function") with zero edge-side logs.
 *
 * The invariant is mechanically enforced for ALL `invokeEdge` targets by
 * `scripts/ci/check-edge-cors-trace.mjs`; this test pins the specific functions repaired in
 * that fix so a revert to inline CORS reddens the suite here too.
 */
const FUNCTIONS = [
  "supabase/functions/notify-applicant-status",
  "supabase/functions/fetch-class-certifications",
  "supabase/functions/fetch-project-certifications",
  "supabase/functions/fill-content-gaps",
  "supabase/functions/scrape-figma-workshops",
  "supabase/functions/triage-error",
  "supabase/functions/check-account-identity",
  "supabase/functions/manage-discord-roles",
  "supabase/functions/backfill-discord-usernames",
  "supabase/functions/confirm-admin-role",
  "supabase/functions/confirm-teacher-role",
  "supabase/functions/screen-sanctions",
  "supabase/functions/record-policy-acknowledgment",
  "supabase/functions/revoke-recording-consent",
  "supabase/functions/submit-dispute",
] as const;

const IMPORTS_CORS_FROM_HTTP_OWNER =
  /import\s*\{[^}]*\bcorsHeaders\b[^}]*\}\s*from\s*["']\.\.\/_shared\/http\.ts["']/;

describe("edge CORS x-trace-id contract", () => {
  it.each(FUNCTIONS)(
    "%s sources corsHeaders from _shared/http.ts (so the x-trace-id preflight is allowed)",
    (mod) => {
      const src = readFileSync(resolve(process.cwd(), `${mod}/index.ts`), "utf8");
      expect(src).toMatch(IMPORTS_CORS_FROM_HTTP_OWNER);
    }
  );
});
