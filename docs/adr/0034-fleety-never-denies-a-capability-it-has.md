# ADR 0034 — Fleety never denies a capability it has (truthful capability, one source)

- Status: Accepted
- Date: 2026-09-02
- Deciders: TechFleet (owner)
- Related: ADR-0009 (Fleety unified brain / internal call seam); ADR-0010 (Figma REST material extraction); ADR-0011 (conversation modes); `decisions.md §9`; `techfleet-chat/prompt.ts`, `_shared/material-fetch.ts`, `techfleet-chat/index.ts`, `techfleet-chat/material-frame.ts`; tests `techfleet-chat/prompt.test.ts`, `_shared/material-fetch.test.ts`.

## Context

Fleety reads a member's shared Figma/FigJam board (or a Tech Fleet doc) through a **server-side pre-fetch** (`material-fetch.ts` → the Figma REST port, ADR-0010) and injects the extracted text into that turn's system prompt as UNTRUSTED DATA. This capability works — but it is **never declared to the model as a tool** (the fetch happens out-of-band in the handler, ADR-0009). So the model's _only_ model of what it can do is the prose in `SYSTEM_PROMPT_BASE`.

Two design choices made that prose lie by omission and let it evaporate:

1. **The base prompt asserted a falsehood.** Inside SAFETY RULES: _"You generate conversational text only — no tools, files, or API calls."_ Intended to mean "don't execute code," it reads as "you have no I/O at all" — the opposite of the real Figma-reading capability, and the only self-description the model ever sees.
2. **Material was harvested from the latest message only** (`extractAllowedUrls(lastUserMessage, 2)`) and the fetched board text was never carried across turns. On a follow-up that re-shared no link, `materialContext` was empty and the board fell out of context.

The result was a real incident. A member shared a board and Fleety reviewed it correctly (verbatim rows, caught a duplicate). On the next turn — _"now evaluate the last two columns"_, no link re-pasted — the board was gone, and the model, prompted only by the "text-only" prose, confabulated _"I can't access external links or peek into Figma files"_ — a capability it had used one turn earlier — then invented a cover story (_"I was working from the structure you described,"_ which the member never gave). The correction that would have prevented it already existed (`material-frame.ts`'s "you CAN read a board" line) but only on turns that already carried material — absent exactly when the denial fired.

## Decision

Move the guarantee out of the model's discretion. Three changes:

1. **Truthful, unconditional capability (prompt layer).** Remove the false "conversational text only — no tools/files/API calls" clause (keep the real "never execute code" rule). Add an always-present **WHAT YOU CAN READ** block: Fleety CAN read a shared viewable Figma/doc link; a board shared earlier in the conversation is already read; it must NEVER claim it cannot open links / access Figma / is "text-only". The only honest "I couldn't read it" is scoped to one specific non-viewable link, with the fix (Share → Anyone-with-the-link → can view → resend).
2. **Material can't evaporate (data layer).** New pure `extractRecentAllowedUrls(messages, max, lookbackUserTurns)` scans recent user turns (bounded window), so a board shared earlier is re-read on a follow-up instead of vanishing. `index.ts` uses it in place of the last-message-only scan.
3. **A strict pre-stream block (guard layer).** Streaming can't retract bytes already sent, so material/review turns are generated NON-streamed (`stream: !materialWasReadable`): the handler validates the whole answer with the pure `detectsCapabilityDenial` and, on a match, replaces it with an honest fallback _before any of it reaches the member_. The detector is first-person-only (and excludes the honest scoped "that one link wasn't viewable" reply), so it can't nuke a grounded review that merely quotes the member. An empty/`{error}` gateway response is reported under its own gateway-error label, never as a capability-denial.

Enforced by `prompt.test.ts` (base prompt must NOT contain the false claim, MUST carry the capability + anti-denial block; detector flags the incident strings and passes the honest scoped reply) and `_shared/material-fetch.test.ts` (a board shared earlier is still returned on a follow-up with no link — the exact incident repro). `decisions.md §9` makes it a standing rule `judge-arch` checks on every future change.

## Considered options

- **(chosen) Truthful prompt + thread-carried material + a strict pre-stream block on material turns.** Removes both causes (the prompt no longer lies; material persists across the thread) AND guarantees a denial can't reach the member even once: review turns are generated non-streamed and the whole answer is validated before release. Mechanized + tested, matching this repo's anti-silent-drop convention (ADR-0031/0032/0033).
- **Log-only observability (stream live; `log.error` at flush if a denial slips through).** Rejected: it cannot retract bytes already streamed, so a fluke denial still reaches that one member. It was the first cut of this change; the owner asked for the strict guarantee, accepting the buffering latency on review turns as the price.
- **Regenerate on a detected denial** (re-call the model with a corrective nudge). Rejected: an extra model call + latency on an already-rare path; after (1)+(2) the denial's cause is gone, so a single honest fallback is the smaller, sufficient recovery.
- **Declare Figma-reading as a real model tool/function** so the model's self-model matches its capability by construction. Rejected as out of scope here — the brain fetches material out-of-band (ADR-0009/0010); a tool-manifest redesign is its own decision. Noted as the deeper direction.
- **Persist fetched board text to conversation state** (a `conversation_materials` table). Rejected for this pass — migrations are hand-applied (§7 / ADR-0026) and the thread re-scan solves the reported incident with no schema change. Durable persistence (survives reloads / new sessions) is a possible later hardening.

## Consequences

- **Positive:** the confabulated capability denial's two causes are structurally removed — the prompt states the read capability truthfully and unconditionally, and a shared board is carried across the conversation. The exact regression is pinned by tests that `judge-arch` and CI check on every future change.
- **Negative / honest scope:**
  - **Review turns don't stream.** To validate the whole answer before release, material/review turns are generated non-streamed — the member sees a brief "thinking" state, then the full review lands, instead of watching it type. This is the accepted cost of "a denial can never flicker on screen"; normal Q&A turns are unaffected and still stream live.
  - **Bounded re-fetch.** The thread re-scan re-reads the board on follow-ups within the lookback window (default 4 user turns), so those turns cost an extra Figma fetch and bypass the L2/L3 caches (as material turns already do). Bounded, no persistence.
  - **The detector both blocks and must stay precise.** Because a match now REPLACES the answer, a false positive would degrade the very review feature this protects — so the detector is first-person-only and uses unambiguous access verbs, distinguishing "I can't read your link" (blocked) from a review that quotes the member ("…stakeholders can't access the board…") or comments on content ("I can't see a problem statement on the board") — both allowed. Novel first-person phrasings can still evade it (a false negative), but the prompt + material changes are what actually prevent the denial; the block is the belt to their braces.
  - `TOKEN_CEILING` 3350 → 3550 (~150 tokens) — a conscious, bounded bump for required capability text (`prompt.test.ts`).

## Confirmation

`techfleet-chat/prompt.test.ts` (26 tests) includes a structural test that FAILS on the old prompt and PASSES on the new (the false claim is gone; the capability + anti-denial block is present), the detector's positive cases (the real incident strings), and its precision negatives (the honest scoped reply, a normal answer, and a grounded review that quotes the member in the third person / uses "see"). `_shared/material-fetch.test.ts` (11 tests) preserves the original SSRF/allow-list coverage and adds the incident repro (share once → follow-up with no link → board still found) and the lookback-window bound. `src/test/smoke/fleety-capability-denial.smoke.test.ts` guards the three structural pieces in source (truthful prompt, thread scan, strict non-streamed block). Mechanical `check:architecture` PASS (0 new violations); `index.ts` type-checks clean. `judge-arch` reviewed twice: the first pass PASSED the structure; the second flagged three issues on the strict block (a false positive that could replace a valid review, an empty-gateway mislabel, and this ADR/§9 still describing the earlier log-only design) — all three addressed here.
