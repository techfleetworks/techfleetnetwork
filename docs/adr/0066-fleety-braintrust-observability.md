# ADR 0066 — Fleety (TAL 9000) LLM-turn observability to Braintrust

- Status: Accepted
- Date: 2026-10-08
- Deciders: Morgan Denner
- Epic: Observability / AI evals

> Number note: at authoring time `origin/main`'s highest ADR is 0065, so 0066 is next. 0058/0059/0062/0063 are reserved on in-flight branches and 0066 may be contended by other open PRs — `scripts/ci/check-adr-number-collision.mjs` is the backstop; renumber if it fires.

## Context

We want AI evals and live observability for **Fleety** (the platform helper bot, "TAL 9000"), using Braintrust (project `8ccac30b-263e-416a-a003-f0e25a3d2c42`). Step one is **live tracing** of Fleety's LLM turns, which later feeds offline eval datasets built from real traffic.

Three implementation facts shaped the design:

- **`techfleet-chat` does not use the shared LLM port.** It raw-`fetch`es OpenRouter in two places — the Stage-1 router (`routeWithModel`) and the Stage-2 answerer (`callGateway`, streamed for normal turns, buffered for material/review turns) — and today parses no provider usage (only a 4-chars/token estimate feeds `fleety_record_cost`). Instrumentation is therefore inline at the call sites, composing a shared owner.
- **This edge runtime has no _guaranteed_ post-response window.** `EdgeRuntime.waitUntil` exists but in-isolate post-response work is best-effort here (`handoff`/the email outbox moved to a DB-queue + cron for anything that must not be lost). Spans are flushed at a live point (the streamed path's `TransformStream.flush`; before the return on buffered paths) via `waitUntil`, and treated as best-effort telemetry.
- **`_shared/dlp.ts` `scrub()` does not cover free-text.** It catches emails, UUIDs, JWTs, keys, IPs and card-like runs — not names, phone numbers, addresses or prose. Content logged for eval fidelity therefore carries member-entered personal data to a processor that, unlike the transient inference providers, retains it.

`fleety_turn_signals` already stores a truncated `user_query` + `user_id` first-party (inside the DB deletion cascade). The new element is the external copy of the full question and answer, keyed by `user_id`, held at a processor outside `handle_user_deletion()` — which governance item 6 addresses.

## Decision

**1. One shared observability owner; three functions instrumented.**
`supabase/functions/_shared/observability/braintrust.ts` is the single file that imports the Braintrust SDK and reads the key/flag. It exposes `startFleetyTrace()` → `llmSpan()`/`log()`/`setError()`/`finish()`. It is **fail-open** (no Braintrust call may throw into a turn; failures report via `createEdgeLogger` and an optional capped audit event) and **zero-hot-path-cost** (during the turn it only buffers plain span records; the SDK dynamic-import, span build and `flush()` run after the response via `EdgeRuntime.waitUntil`, with timing carried as `metrics.start`/`metrics.end`). v1 covers the member-facing LLM turns: `techfleet-chat` (root `task` span + `router` and `answer` `llm` children, inline), `fleety-review` (buffered answer span), and `fleety-extract` (image OCR span only). `fleety-embed`, `fleety-learning-digest`, `fleety-weekly-digest`, `register-fleety-command` and the port-based hand-off writer are out of v1 (embeddings / cron-admin / no LLM / different surface) — an explicit choice, not a silent omission.

**2. Full question + answer, with a secrets-only scrub.**
Content is recorded verbatim for eval fidelity, but input and output first pass through a new `scrubSecretsOnly()` in `_shared/dlp.ts` that removes credentials only (JWT, Bearer, `sb_`/`sk_`/`pk_` keys, long hex tokens, card-like runs) and preserves names/emails/free text. Credentials have no eval value and are pure liability (a member can paste a token into a question). The answer span's input is the **conversation**, never the full system prompt — the system prompt embeds retrieved KB and any uploaded member material, which are not recorded in v1.

**3. DB `user_id` in metadata; internal turns excluded.**
The `user_id` is attached as span **metadata** (never inside scrubbed content, so it is not redacted), supporting per-member usage analytics, and it is the deletion key. The Discord `/fleety` adapter path uses a synthetic `INTERNAL_SYSTEM_USER_ID`; those turns are tagged `caller:"internal"` and excluded from per-user analytics and from the deletion cascade.

**4. Cost ownership is unchanged.**
`fleety_record_cost` stays the single owner of cost accounting (its estimate is recorded pre-stream on purpose, so aborted turns still bill). Braintrust is a read-consumer of the newly-parsed real usage (`stream_options:{include_usage:true}` on streamed calls; `data.usage` on buffered/router) — never a second cost writer.

**5. Deploy-free kill switch.**
`FLEETY_BRAINTRUST_ENABLED` is read at runtime and defaults **ON** when unset (honouring "on immediately, no dark launch"); setting it to `0` disables all emission on the next isolate with no redeploy (a `_shared/**` change otherwise forces a full-fleet redeploy). A missing `BRAINTRUST_API_KEY` is also a no-op.

**6. Governance — owner actions, blocking before enabling in production.**
Sign the Braintrust DPA with a no-training / no-secondary-use clause and SCCs/UK-IDTA (+ DPF) for EU/UK transfer; set and verify Braintrust project retention to **30 days** before the first real trace; add Braintrust to the subprocessor register + privacy notice; record the lawful basis as **legitimate interest** with a written LIA and an in-app opt-out (consent is incompatible with an immediate all-user launch); and build the **deletion cascade** — account deletion enqueues a durable purge-by-`user_id` job for Braintrust (idempotent worker, paged backlog), with the 30-day TTL as the backstop — plus a data-classification inventory row and a DSAR-propagation entry.

## Consequences

**Good**

- Full-fidelity eval data (verbatim Q&A) and real token/latency metrics Fleety has never had.
- Per-member usage analytics via `user_id`.
- Exposure bounded by the secrets scrub, a 30-day TTL, least-privilege project access, and the no-secondary-use DPA.
- Zero added TTFB; Fleety is byte-identical whether Braintrust is on, off, down, or misconfigured.

**Accepted / costs**

- A new external store of member content that sits outside the DB deletion cascade and must be cascaded to explicitly (item 6).
- Free text may contain special-category data that no automated scrub catches — an owner-accepted residual, mitigated by short retention, access control, the DPA and opt-out.
- Best-effort delivery: a streamed span can be lost (e.g. a client disconnect mid-stream). Acceptable for eval telemetry; a durable queue + cron is the upgrade path.
- The `_shared/**` change full-redeploys all ~117 edge functions; the owner module is import-inert and fail-open so the forced redeploy of uninstrumented functions is safe.

## Alternatives considered

1. **Metadata/metrics only (no content).** Lowest risk but kills eval fidelity — recorded as the safer fallback.
2. **HMAC-pseudonym `user_id`.** More privacy-preserving, but the owner needs the real id to cross-reference TFN tables — mitigated instead by short retention, least-privilege access, and the deletion cascade.
3. **Consent as the lawful basis.** Incompatible with "on for everyone immediately"; legitimate interest + LIA + opt-out fits the launch.
4. **Dark launch behind a flag (ADR-0021 pattern).** Declined by the owner; the compromise is a real, instant kill switch instead of a staged ramp.
5. **Durable queue + cron for guaranteed delivery.** Deferred — best-effort is sufficient for v1; the durable pattern (proven in `handoff`/email-outbox) is the upgrade.

## Follow-ups

- Governance artifacts (item 6) are blocking before enabling in production.
- Enrich cache/canned/out-of-scope turns with richer exit metadata (they already flush as root + router spans via the handler `finally`).
- Instrument the port-based hand-off writer (its own project or `fn`-tag).
- Replace the 4-chars/token estimate in `fleety_record_cost` with the parsed real usage (same-owner improvement, separate change).
