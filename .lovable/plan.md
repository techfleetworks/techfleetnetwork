# Fleety Follow-up Query Suggestions

Add up to 3 suggested next questions at the end of each Fleety answer. Clicking one immediately runs it as the user's next query.

## UX

- Render below the existing action chips on each assistant message, in a labeled group "Suggested follow-ups".
- Pill style distinct from action chips (subtle, prefixed with a small chat icon) so users can tell "ask Fleety this" vs "open a link / mark step done".
- Max 3 items, each ≤ 80 chars. Hidden when the answer was a quota/error response or when the model returns none.
- Click behavior: chip text becomes the next user message and is sent immediately (no need to edit). Disabled while a request is in flight.
- Keyboard: chips are real `<button>`s, focusable, Enter/Space activates, `aria-label="Ask: <query>"`.

## How follow-ups are generated

- The system prompt in `supabase/functions/techfleet-chat/index.ts` is extended with a final-line contract: after the markdown answer, the model emits a single sentinel line  
  `<<FLEETY_FOLLOWUPS>>["question 1","question 2","question 3"]`  
  with 0–3 short, self-contained questions related to what was just discussed and the user's likely next step.
- The existing `sanitizeStream` transform (~line 1430-1518) detects this sentinel in the buffered assistant output, **strips it from what the user sees**, parses the JSON array, validates (array of strings, ≤3, each ≤120 chars, no URLs, no HTML), and on `flush()` enqueues one extra SSE frame:  
  `data: {"fleety":{"followups":["..."]}}`
- L3 cache hits (`buildCacheSSEStream`) and canned answers will not have follow-ups in v1. (Acceptable: ~30% of turns; we can revisit by storing followups in `fleety_response_cache` later.)
- Quota-blocked / cost-guard `hard` responses skip the contract entirely.

## Cost / safety

- No extra model call — follow-ups ride on the same completion (a few extra output tokens, well under the per-turn cap).
- The sentinel is stripped server-side so prompt-leak risk to the user is zero, and follow-ups go through the same `sanitizeAIOutput` path before being JSON-encoded.
- Client validates again: array, length ≤ 3, each item is a non-empty string ≤ 120 chars; otherwise discarded silently.

## Client changes (`src/components/FleetyChatWidget.tsx`)

- Extend `Msg` with `followups?: string[]`.
- In the SSE parser inside `streamChat`, when a parsed frame has `parsed.fleety.followups`, call a new `onFollowups` callback instead of treating it as content.
- `send()` wires `onFollowups` to attach the array to the latest assistant message.
- Render block under the chips (or replacing the empty space when no chips), with a small "Suggested follow-ups" label.
- Add `runFollowup(text)` helper that pushes a user message and reuses the existing `send` pipeline (extracted into a `sendText(text)` so both the form submit and the chip click share one code path). Auto-clears follow-ups on the previous message after click to avoid double-sends.

## Telemetry

- Reuse `fleety_action_events` with `action_type = "followup_click"` and `action_label = <query>`. The existing `fleety_turn_signals.chips_clicked` counter already tracks engagement; we'll keep follow-up clicks separate by action_type so analytics can split them.

## BDD scenarios (added to `bdd_scenarios`)

- `F-FOLLOWUP-001` — Assistant answer renders 1–3 follow-up chips under the message  
  - [UI] chips visible with `role="group" aria-label="Suggested follow-ups"`  
  - [Code] SSE frame `{fleety:{followups:[...]}}` parsed and array stored on message  
  - [DB] no rows written until clicked
- `F-FOLLOWUP-002` — Clicking a follow-up sends it as the next user message  
  - [UI] new user bubble appears with the chip text, input stays empty  
  - [Code] `sendText` invoked with chip label, prior message's `followups` cleared  
  - [DB] `fleety_action_events` row inserted with `action_type='followup_click'` and matching `turn_id`
- `F-FOLLOWUP-003` — Malformed sentinel is silently ignored  
  - [UI] no follow-up section, answer text unaffected  
  - [Code] JSON parse failure caught, no console error surfaced to user  
  - [DB] turn row still recorded, `chips_clicked=0`
- `F-FOLLOWUP-004` — Cache/canned-hit responses render no follow-ups (v1 limitation)  
  - [UI] only the cached answer renders, no follow-up group  
  - [Code] `buildCacheSSEStream` does not emit a `fleety` SSE frame  
  - [DB] `fleety_response_cache` row served unchanged

## Files touched

- `supabase/functions/techfleet-chat/index.ts` — extend system prompt, add sentinel stripper + extra SSE frame in `sanitizeStream`.
- `src/components/FleetyChatWidget.tsx` — type, parser branch, `onFollowups`, `sendText` extraction, render block, click handler with telemetry.
- `src/components/resources/GuidanceEmbed.tsx` — same parser branch + render (smaller, mirrors widget).
- New migration: insert the four `F-FOLLOWUP-00x` rows into `bdd_scenarios`.

## Out of scope (next iterations)

- Persisting follow-ups in the L3 cache so cached replays also show them.
- Personalizing follow-ups using `fleety_turn_signals` history (top intents per user).
- A/B testing chip wording via `prompt_version`.
