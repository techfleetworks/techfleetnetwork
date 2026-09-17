# ADR 0044 — Fleety chat gateway: bounded retry, model fallback, and graceful degradation

- Status: Accepted
- Date: 2026-09-17
- Deciders: TechFleet (owner)
- Related: `supabase/functions/techfleet-chat/index.ts` (the chat handler), `supabase/functions/_shared/llm/port.ts` (`withRetries` / `throwForLlmStatus` / `LlmRateLimitError` — the shared retry seam, ADR-0005), `supabase/functions/techfleet-chat/degrade.ts` (+ `degrade.test.ts`), ADR-0034 (strict material/review non-streamed path), `supabase/functions/CLAUDE.md` ("Compose `_shared`, don't hand-roll"; "Errors are reported"). Skills: `enterprise-architecture-standards`, `sre-operational-readiness`, `release-deployment-safety`.

## Context and problem statement

Fleety's answers come from an external model (DeepSeek `v4-pro`) served through OpenRouter. The chat edge function hand-rolled its own `fetch` to OpenRouter and, on a `429`, returned `"Rate limit exceeded. Please try again in a moment."` straight to the trainee — **no retry, no fallback**. A single transient upstream throttle therefore surfaced as a dead error in the widget, even though `_shared/llm/port.ts` already owned a bounded-retry policy (`withRetries`, honoring `Retry-After`) that the hand-off writer path uses.

Two distinct problems: (1) the chat call bypassed the shared retry seam, so transient blips were not absorbed; (2) _any_ terminal failure (sustained throttle, out-of-credits `402`, provider `5xx`, network fault) became a hard error with no live-answer fallback and no useful degraded response — Fleety simply "broke" for that turn.

The owner's goal is that a trainee **never sees Fleety broken**. Literal 100% uptime of an LLM-dependent feature is not achievable — an external provider can be fully down — so the achievable, structural guarantee is: **a provider failure can never reach the trainee as a dead error; it degrades to an honest, useful response**, and the outage is loudly visible to admins.

## Decision drivers

- **Never a dead error.** The user-facing failure mode of a provider outage must be a useful answer or an honest "I can't right now, here's what helps," not an error toast.
- **Compose `_shared`, don't hand-roll** (edge rule). Reuse the existing `withRetries` retry seam rather than writing a second retry loop in the handler.
- **Accuracy is not negotiable** (this codebase's core discipline). A degrade must never fabricate a substantive answer, and a lower-quality fallback model must not silently pollute the permanent answer cache.
- **Failures the caller can't see must be reported** (edge rule). Graceful degradation hides the failure from the _user_ — so it must be surfaced to the _observability sink_ with a precise, alertable reason, or an outage becomes invisible.
- **Interactive latency.** A retry/fallback budget must not make a trainee wait a long time, and must not truncate a legitimately long answer.

## Considered options

1. **Raise the OpenRouter account limit only.** Rejected as a _sole_ fix: it is an operational lever (credits/tier/per-key cap, off-repo) that reduces how often we hit the limit but makes nothing structurally resilient — the next transient blip or provider incident still breaks the turn. (Still recommended operationally, alongside this.)
2. **Add a bespoke retry loop in the chat handler.** Rejected: duplicates the `withRetries` policy that already exists (drift #2; violates "compose `_shared`"). Two retry policies drift apart.
3. **Retry via `withRetries`, then a fallback model, then graceful degrade (chosen).** Route each model call through the shared retry seam; if the primary answerer still fails, try a fallback model; if all fail, return a useful, accurate degraded answer as a normal 200 stream and report the failure loudly.

## Decision outcome

**Chosen: Option 3.** Three layers, in the chat handler and the shared port:

- **Layer 1 — bounded retry (shared seam).** The gateway call runs through `withRetries` (ADR-0005): transient `429`/`5xx` are retried honoring `Retry-After`, bounded by a total deadline. The status→retry mapping was extracted into `throwForLlmStatus` in `port.ts` so the chat path and the hand-off path classify a `429`/`5xx`/`4xx` identically; that helper also drains the error body before a retryable throw (no undrained response on the hot path). Budgets are **split by latency profile** and share ONE wall-clock across the primary→fallback sequence: streaming turns bound _time-to-first-token_ (25s/attempt, 45s overall — the token stream runs after and is unbounded by these); buffered material/review turns (`stream:false`, ADR-0034) bound _full-answer generation_ (90s/attempt, 110s overall), because there the response headers do not arrive until the whole answer is generated. The overall budget is **drawn down across both models** (not a fresh deadline per model) and kept under the edge function wall-clock limit, so the degrade always runs rather than the platform killing the function mid-flight.
- **Layer 2 — fallback model.** If the primary model fails after retries, a second model (`FLEETY_LLM_FALLBACK_MODEL`, default `deepseek/deepseek-v4-flash-0731`) is tried through the same retry policy. Same US-provider residency pin applies. A fallback answer is **not written to the L2/L3 cache** (that store is permanent per `kb_version`; a flatter fallback reply must not outlive the outage). Answering via fallback is logged.
- **Layer 3 — graceful degradation.** If every model fails, the handler returns a normal `200` streamed answer (via the existing `buildCacheSSEStream`) built by `buildDegradeMarkdown` — **accurate by construction**: it lists only the real KB sources already retrieved for this question plus the standing fallbacks (search / Knowledge Base / office hours), and never fabricates an answer. The response carries `X-Fleety-Degraded: 1`, and the failure is logged at `error` with a precise `reason` (`out_of_credits` / `rate_limited` / `gateway_error`) so admins can alert on it.

## Consequences

**Good**

- A transient throttle no longer reaches trainees; a _sustained_ provider outage degrades to a useful, honest answer instead of a dead error. The "unhandled provider failure surfaces as an error" class is structurally closed.
- The chat path now reuses the one retry policy (`port.ts`), so retry behavior can't drift between chat and hand-off.
- Degradation is observable and durable: every degrade writes a `fleety_chat_degraded` audit row (via `write_audit_log`, carrying `reason`) plus a distinct `error` log and an `X-Fleety-Degraded` header, so an outage is queryable by ops even though users are not blocked.

**Bad / accepted**

- **Not 100% uptime, and cannot be.** This guarantees graceful _degradation_, not that the model always answers. When the provider is down, trainees get the fallback message, not a live answer. That is the real ceiling for an LLM-backed feature and is accepted deliberately.
- **Degradation can mask an outage.** Turning failures into friendly `200` answers means users won't report "Fleety is down." Accepted, and mitigated by (a) a durable audit row (`write_audit_log`, event `fleety_chat_degraded`, carrying `reason`) so the outage is queryable, not just in ephemeral logs, plus (b) the loud `error` log + `X-Fleety-Degraded` header. Wiring an **alert** on `reason=out_of_credits` / a spike in degrade rows is the remaining ops follow-up (not in this change).
- **The fallback model flattens nuance.** `v4-flash` is faster/cheaper but less nuanced than `v4-pro` (the reason `v4-pro` was chosen). Accepted: a slightly flatter live answer beats an error, and fallback answers are excluded from the cache so quality is not persisted.
- **Buffered turns can wait up to ~110s (the shared budget) before degrading.** Accepted: that path already blocks on full generation by design (ADR-0034); the shared budget _bounds_ a hang that previously had no limit and is set under the edge wall-clock so the degrade runs rather than the platform killing the function.
- **The fallback model is skipped if the primary exhausts the shared budget.** Accepted: degrading _under_ the edge wall-clock takes priority over a second full-length attempt — a guaranteed graceful answer beats risking a platform kill for one more model.

## Confirmation

- `supabase/functions/_shared/llm/port.test.ts` — `throwForLlmStatus` classification (429 waits `Retry-After`, capped; 5xx retryable; 402/4xx fail-fast) and `withRetries` preserving the last failure as `.cause`.
- `supabase/functions/techfleet-chat/degrade.test.ts` — `buildDegradeMarkdown` always offers the standing fallbacks, lists only real http(s) KB links, drops unsafe schemes, and never fabricates an answer. Wired into CI (`ci.yml` deno test list).
- `deno check` on the chat handler passes; the mechanical architecture gate (`npm run check:architecture`) and `judge-arch` review both pass for the change.
- Operational follow-up (not code): confirm/raise OpenRouter account headroom (balance/tier + per-key limit) and add an alert on the degrade `reason`.
