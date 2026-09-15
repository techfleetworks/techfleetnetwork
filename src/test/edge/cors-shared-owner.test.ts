// Regression coverage for the CORS-first wave (ADR-0043): the edge functions migrated off
// hand-rolled CORS must keep sourcing it from the shared owner (../_shared/http.ts), which lists
// x-trace-id. If any regresses to an inline block, invokeEdge callers hit a preflight FunctionsFetch
// error with zero edge logs — so this test pins each one. (check-no-inline-cors.mjs enforces the
// invariant repo-wide + shrink-only; this is the targeted per-function proof for the migrated set,
// and doubles as bdd-gate coverage for these changed modules.)
//
// bdd-gate coverage: supabase/functions/delete-account, discord-project-update, eo-contact-status,
// firecrawl-search, fleety-embed, framework-csv-fetch, generate-discord-invite, get-community-events,
// grant-observer-role, gumroad-backfill, gumroad-reconcile, ingest-csv-knowledge, ingest-reference-csv,
// ingest-workshop-docs, mark-interview-scheduled, promote-to-teacher, record-consent,
// repair-discord-username, replay-dlq-emails, resolve-discord-id, revoke-teacher-role,
// send-community-agreement-trigger, send-project-blast, translate-bundle, translate-strings.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO = process.cwd();

// The functions migrated to the shared CORS owner in this wave.
const MIGRATED = [
  "delete-account",
  "discord-project-update",
  "eo-contact-status",
  "firecrawl-search",
  "fleety-embed",
  "framework-csv-fetch",
  "generate-discord-invite",
  "get-community-events",
  "grant-observer-role",
  "gumroad-backfill",
  "gumroad-reconcile",
  "ingest-csv-knowledge",
  "ingest-reference-csv",
  "ingest-workshop-docs",
  "mark-interview-scheduled",
  "promote-to-teacher",
  "record-consent",
  "repair-discord-username",
  "replay-dlq-emails",
  "resolve-discord-id",
  "revoke-teacher-role",
  "send-community-agreement-trigger",
  "send-project-blast",
  "translate-bundle",
  "translate-strings",
] as const;

// Comment-stripped view so a header named only in a rationale comment isn't mistaken for a value.
function code(fn: string): string {
  const src = readFileSync(resolve(REPO, `supabase/functions/${fn}/index.ts`), "utf8");
  return src
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");
}

describe("CORS-first wave: migrated edge functions source CORS from the shared owner", () => {
  it.each(MIGRATED)("%s imports corsHeaders from ../_shared/http.ts", (fn) => {
    expect(code(fn)).toMatch(/from\s+["'][^"']*_shared\/http\.ts["']/);
  });

  it.each(MIGRATED)(
    "%s does not hand-roll Access-Control-Allow-Headers as a plain literal",
    (fn) => {
      const c = code(fn);
      // Allowed: extending the shared set via a template literal that references the imported value
      // (send-community-agreement-trigger). Forbidden: a plain string-literal allow-list.
      const literalAllow = /["']Access-Control-Allow-Headers["']\s*:\s*["'][^"'`]*["']/.test(c);
      expect(literalAllow).toBe(false);
    }
  );
});
