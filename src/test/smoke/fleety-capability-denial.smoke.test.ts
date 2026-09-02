import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

/**
 * Regression guard for the capability-denial fix (ADR-0034). Fleety read a member's Figma board,
 * then on a follow-up with no re-pasted link it lost the board and confabulated "I can't access
 * external links or peek into Figma files" — a capability it had just used. These assertions read
 * the edge-function source directly (Deno-only, can't be imported into vitest) and fail loudly if
 * any of the three structural guards is removed: the truthful prompt, the thread-wide material
 * scan, or the strict pre-stream block that validates a material answer before releasing it.
 */
describe("fleety capability-denial guards (ADR-0034)", () => {
  const chat = read("supabase/functions/techfleet-chat/index.ts");
  const prompt = read("supabase/functions/techfleet-chat/prompt.ts");

  it("CAP-DENIAL-001: the base prompt never lies about I/O and states the read capability", () => {
    // The false blanket claim that seeded the confabulation must never come back…
    expect(prompt).not.toMatch(/conversational text only\s*—\s*no tools, files, or API calls/i);
    // …and the unconditional truthful capability + anti-denial block must be present.
    expect(prompt).toMatch(/WHAT YOU CAN READ/);
    expect(prompt).toMatch(/NEVER tell a member you cannot open links/i);
  });

  it("CAP-DENIAL-002: material is harvested across the thread, not just the latest message", () => {
    // A board shared earlier is re-read on a follow-up (the evaporation fix).
    expect(chat).toMatch(/extractRecentAllowedUrls\(\s*sanitizedMessages/);
    // The last-message-only scan must never be what feeds material URLs again.
    expect(chat).not.toMatch(/extractAllowedUrls\(\s*lastUserMessage/);
  });

  it("CAP-DENIAL-003: material/review turns are generated NON-streamed so the answer can be validated", () => {
    // Streaming can't retract bytes; validating the whole answer requires a buffered (non-streamed) turn.
    expect(chat).toMatch(/stream:\s*!materialWasReadable/);
  });

  it("CAP-DENIAL-004: a denial is BLOCKED before release on a material turn (strict, not just logged)", () => {
    // The buffered branch runs only when material was readable, validates with the detector, and
    // swaps a denial for the honest fallback before returning a buffered SSE stream (not response.body).
    expect(chat).toMatch(/if\s*\(\s*materialWasReadable\s*\)\s*\{/);
    expect(chat).toMatch(/detectsCapabilityDenial\(/);
    expect(chat).toMatch(/CAPABILITY_DENIAL_FALLBACK/);
    expect(chat).toMatch(/buildCacheSSEStream\(\s*visible/);
  });
});
