// Error-handling contract for supabase/functions/process-notification-fanout.
// PR-5 (audit §8) routed this function's error response through the single `errorResponse` owner so a
// caught error's text can't leak to the client. This source-contract test pins that: the function
// imports errorResponse from the shared http owner, returns errors through it, logs the real error,
// and never embeds a caught error's .message/.stack in a response body. It FAILS if the leak is
// reintroduced or the owner is dropped (non-vacuous), and it satisfies the bdd-gate's "every changed
// module has test coverage" rule (D-13).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(process.cwd(), "supabase/functions/process-notification-fanout/index.ts"),
  "utf8"
);

describe("process-notification-fanout — error-response contract (§8)", () => {
  it("imports the shared errorResponse owner from _shared/http.ts", () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*\berrorResponse\b[^}]*\}\s*from\s*["']\.\.\/_shared\/http\.ts["']/
    );
  });

  it("returns failures through errorResponse (static message), not a hand-built error body", () => {
    expect(SRC).toMatch(/return\s+errorResponse\(/);
  });

  it("logs the real error for operators (reported, not swallowed) — §4", () => {
    expect(SRC).toMatch(/console\.error\([^)]*\berr\b/);
  });

  it("never puts a caught error's .message/.stack in a jsonResponse/Response body (§8)", () => {
    // The caught variable is `err`; after the fix it must not reach a response body.
    expect(SRC).not.toMatch(/(?:jsonResponse|new\s+Response)\([^;]*\berr(?:or)?\s*\.\s*(?:message|stack)\b/s);
  });
});
