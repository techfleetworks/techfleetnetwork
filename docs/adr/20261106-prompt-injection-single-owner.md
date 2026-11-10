# Prompt-injection detection has a single owner

- Status: Accepted
- Date: 2026-11-06
- Relates to: re-audit 2026-10-30 finding **RH3 / PAT-1**; [decisions.md §8](../../decisions.md) ("Untrusted content: one owner")

## Context

Deciding whether an untrusted chat message is a jailbreak / instruction-override attempt (OWASP
**LLM01: Prompt Injection**) is a security invariant. The re-audit (2026-10-30, RH3·PAT-1) found it
implemented **twice**, and the two copies had drifted:

- **The live guard** — `hasPromptInjection` inline in `supabase/functions/techfleet-chat/index.ts`
  (~line 160), 15 patterns, called at the top of a turn to short-circuit a flagged message to a firm
  boundary reply (no retrieval, no LLM call). It had **no test**.
- **A dead copy** — `hasPromptInjectionPattern` in `src/lib/security.ts` (~line 1197), 8 **different**
  patterns, with a unit test in `src/test/lib/security-extended.test.ts`. Grep proof: its only
  references were its own definition, that test, and a string literal in `scripts/pentest/sast.mjs`.
  **Zero production callers.**

So the copy that was tested was not the copy that ran, and the SAST check `SAST-LLM-MCP-TOOL-GUARDS`
pinned the *dead* copy to `src/lib/security.ts` — enforcing the duplication. This is the exact
"same security logic ships in two places and drifts" failure decisions.md §8 already names for HTML
stripping, redirect validation, and edge-error shaping.

## Decision

Give prompt-injection detection **one owner** and make a second copy un-mergeable.

1. **One module:** `supabase/functions/_shared/prompt-injection.ts` exports `hasPromptInjection` and
   `PROMPT_INJECTION_PATTERNS`. It is pure, runtime-agnostic TypeScript (regex only — no Deno/DOM
   globals), so the single owner is importable from both the Deno edge functions **and** the Vite/React
   `src` bundle if a client-side pre-flight is ever needed, without a second implementation. It carries
   the **live** pattern set verbatim, so production behavior is unchanged (no weaken, no silent
   strengthen).
2. **The live caller imports it:** `techfleet-chat` now `import { hasPromptInjection } from
   "../_shared/prompt-injection.ts"`; the inline patterns are deleted.
3. **The dead copy is removed:** `hasPromptInjectionPattern` is deleted from `src/lib/security.ts`
   (the file stays — many live importers use its other exports) and its test block is removed.
   `SAST-LLM-MCP-TOOL-GUARDS` is repointed: the injection assertion now targets the owner module; the
   MCP tool-call policy needles (`isAllowedAiToolCall`, …) still target `security.ts`.
4. **Tested at the owner:** `supabase/functions/_shared/prompt-injection.test.ts` (Deno, wired into
   `ci.yml`) exercises the patterns that actually guard the live endpoint — 15 attack payloads flagged,
   benign Tech-Fleet questions and empty/non-string input not flagged.
5. **Prevent-by-construction:** `scripts/ci/check-single-prompt-injection-owner.mjs` (blocking,
   `critical` lane, auto-wired by its `// ci-lane:` marker) fails the build if a detector is
   re-declared **by name** or **by the injection regex signature** (a renamed copy) anywhere under
   `src/**` / `supabase/functions/**` except the owner, and **fails closed** if the one owner is deleted
   or its detector stripped. Discriminated by
   `src/test/smoke/check-single-prompt-injection-owner.smoke.test.ts` (dup/rename/owner-gone cases
   redden when the guard is neutralized).

## Consequences

- **Good:** the detector that runs is the detector that is tested; there is one place to review and
  strengthen the patterns; a third copy cannot silently reappear.
- **Good:** boundary placement and data-ownership are correct — a security decision lives in a shared
  owner, not inline in a handler or in a dead client helper.
- **Neutral / deliberate scope:** the dead copy's 8 patterns (which included `tool call|mcp server` and
  `exfiltrate|send secrets to`) are **not** merged into the owner — doing so would change live behavior
  (more inputs flagged) and is out of scope for a de-duplication. The owner is extensible if a future
  change wants those, under its own review.
- **Follow-up (out of scope, noted):** `isAllowedAiToolCall` / `AiToolPolicy` in `src/lib/security.ts`
  are *also* dead (defined + tested, zero callers). Left in place here to keep this change focused on
  RH3·PAT-1; worth a separate dead-code removal.

## Alternatives considered

- **Keep the detector in `src/lib/security.ts` and have the edge import from there.** Rejected — edge
  functions compose from `supabase/functions/_shared` (scoped CLAUDE.md "compose `_shared`, don't
  hand-roll"); importing deep into the client bundle from Deno inverts the dependency and crosses the
  app boundary the wrong way. The owner belongs where the live guard and the other shared security
  helpers live.
- **Delete the dead copy only, leave the live guard inline.** Rejected — that removes the drift today
  but leaves the live logic un-shared and re-duplicable tomorrow; the finding is about single ownership,
  not just the one dead copy.
- **A guard that only forbids the exact old names.** Rejected as too weak — a renamed copy would evade
  it; the guard also matches the injection regex signature so a rename is still caught.
