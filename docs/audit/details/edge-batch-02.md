# Edge function security audit — Batch 02 (payment path + file handoff + Discord invite)

Reviewer: skeptical app-sec. READ ONLY. Root: `C:/Users/morga/Documents/tfn-audit`.
Standard: decisions.md §4/§5/§8 + supabase/functions/CLAUDE.md. Each index.ts read in full.
Coverage-matrix flags (err-leak, hand-rolled-role) CONFIRMED/REFUTED against the actual code.

All 23 functions reviewed. No CRITICAL. Payment path is sound. Handoff IDOR is controlled.
The dominant real issues are §8 error-message leakage (narrower than the matrix claims) and
§5 hand-rolled admin checks (functionally correct, but violate the one-owner rule).

## (a) Per-function table

| function | classification (intended?) | authN ok? | authZ / IDOR | input valid | err-leak confirmed? | worst issue |
|---|---|---|---|---|---|---|
| generate-discord-invite | USER-AUTH (yes) | yes (JWT getUser) | self only (bot invite for caller) | ok | **CONFIRMED** L258 `error: message` | err.message → client (§8) |
| geo-hint | PUBLIC (yes) | n/a | n/a (returns country hdr) | n/a | REFUTED | CORS omits x-trace-id (preflight risk) |
| get-community-events | PUBLIC (yes) | n/a | n/a (public cal) | zod + WAF + RL | REFUTED (static) | none material |
| get-discord-member-count | PUBLIC (yes, landing) | n/a | n/a | n/a | REFUTED | none material |
| get-i18n-bundle | PUBLIC (yes) | n/a | n/a | regex + RL | REFUTED (static "internal_error") | none material |
| grant-observer-role | USER-AUTH (yes) | yes (JWT) | self only; lessons+discord gated; idempotent | zod + size cap | PARTIAL (L354 returns Discord API text) | external error text in body |
| guide-ingest | ADMIN/SERVICE/CRON (yes) | yes | admin-or-machine gate | SSRF-guarded, no redirect | **CONFIRMED** L182 | err.message → client + hand-rolled admin |
| gumroad-backfill | USER-AUTH (yes) | yes (verified token email) | self only; no cross-buyer IDOR | page cap, seller filter | REFUTED (static; err→audit) | none material |
| gumroad-backfill-all | ADMIN/SERVICE-CRON (yes) | yes (svc OR admin JWT) | admin/cron only | seller filter | REFUTED (static; err→audit) | hand-rolled admin + inline CORS no x-trace-id |
| gumroad-reconcile | USER-AUTH (yes) | yes (verified token email) | self only; LIKE-escaped email | — | REFUTED (static; err→audit) | none material |
| gumroad-webhook | WEBHOOK (yes) | **yes — constant-time secret + seller_id** | n/a (service-role ledger) | zod + 16KB cap | REFUTED (static; err→audit) | secret in URL query (Gumroad limit, LOW) |
| handle-email-suppression | WEBHOOK (yes) | yes (HMAC verifyWebhookRequest + stale-ts) | n/a | field checks; idempotent upsert | REFUTED (static) | none material |
| handle-email-unsubscribe | PUBLIC token-bound (yes) | yes (single-use token, TOCTOU-safe) | token-scoped; tier-1 only | shared http | REFUTED (errorResponse owner) | none material |
| handoff-download | USER-AUTH (yes) | yes (getUser) | **IDOR re-checked per req; 404 no-oracle** | parseDownloadBody | REFUTED | none material |
| handoff-produce | USER-AUTH (yes) | yes | active-member-or-admin gate | zod | REFUTED | none material |
| handoff-submit | USER-AUTH (yes) | yes | member/admin; created_by from token (mass-assign safe); magic-byte file validate | zod-ish + 72MB cap | REFUTED | none material |
| handoff-worker | SERVICE-CRON (yes) | **yes — constant-time bearer** | service-role only | — | REFUTED (static; err→log) | none material |
| ingest-csv-knowledge | ADMIN (yes) | yes | admin only | zod | **CONFIRMED** L244 | err.message → client + hand-rolled admin |
| ingest-reference-csv | ADMIN/SERVICE (yes) | yes | admin or service-role | zod + caps | **CONFIRMED** L510/L676 | err.message → client; svc token `===` non-const-time; hand-rolled admin |
| ingest-workshop-docs | ADMIN (yes) | yes | admin only | zod + caps + stripActiveContent | **CONFIRMED** L222 (per-doc results[].error) | DB err.message → client + hand-rolled admin |
| login-with-captcha | PUBLIC auth-gate (yes) | n/a (pre-auth) | n/a; generic errors, no enum | zod | REFUTED (generic msgs) | **Origin-spoof captcha bypass** |
| manage-discord-roles | USER-AUTH + admin-for-writes (yes) | yes (JWT; admin for mutate) | admin gate on create/assign/remove; list = any member | size cap + discriminator | **CONFIRMED L474 (matrix MISSED this)** | err.message → client + hand-rolled admin |
| mark-interview-scheduled | USER-AUTH (yes) | yes (getUser) | **own application only (L116); HTML-escaped** | zod + UUID re | REFUTED (static; err→log) | none material |

## (b) Findings

### MEDIUM — §8 error-message leakage (CodeQL js/stack-trace-exposure class)
decisions.md §8: "An edge error response never carries the error." Log it, return a static message.

- **generate-discord-invite** `index.ts:258` — `return new Response(JSON.stringify({ error: message }), {status:500})` where `message = error.message` (L245). Leaks internal/config error text + concatenated Discord API error bodies to an authenticated caller. Fix: `errorResponse(e, "Could not generate invite", 500)`; keep the audit write.
- **manage-discord-roles** `index.ts:474` — top-level catch returns `{ error: message }` (`err.message`). **Coverage matrix marked this function err-leak = `·` (false negative).** Fix: static message; the real error already goes to log + audit.
- **guide-ingest** `index.ts:182` — top-level catch returns `e.message`. Fix: static "Ingest failed".
- **ingest-csv-knowledge** `index.ts:244` — top-level catch returns `err.message`. Fix: static message.
- **ingest-reference-csv** `index.ts:510` (DB upsert error) and `index.ts:676` (top-level catch) return `error.message`. Fix: static messages; log the detail.
- **ingest-workshop-docs** `index.ts:222` — per-doc `results[].error = error.message` (raw DB error) returned in the 200 body. Fix: return a boolean/`ok:false` + generic reason; log the DB message.
- Evidence state: CONFIRMED by reading the exact return statements. Exposure is bounded (ingest/role fns are admin-gated; generate-invite is any member). Not exploitable for data theft but violates §8 and leaks schema/infra detail.

### MEDIUM — §5 hand-rolled admin checks (one-owner violation)
supabase/functions/CLAUDE.md: "No inline admin checks… use the shared `has_role`-backed helper."
These query `user_roles` directly for authz. Functionally correct today, but each is a drift
point (the exact class §5 forbids). CONFIRMED by reading:
- gumroad-backfill-all `index.ts:97-105` (`isAdmin()` selects user_roles)
- guide-ingest `index.ts:94-98`
- ingest-csv-knowledge `index.ts:128-133`
- ingest-workshop-docs `index.ts:132-137`
- ingest-reference-csv `index.ts:253-258`
- manage-discord-roles `index.ts:182-187`
Fix: route through the shared `has_role` RPC / `requireAdminRequest` (as handoff-* already do via `svc.rpc("has_role", …)`).
Note: handoff-download/produce/submit and mark-interview-scheduled were matrix-flagged "hand-rolled-role" but REFUTED — they call the `has_role` RPC (correct) or query user_roles only to *find admins to notify*, not for an authz decision.

### MEDIUM — login-with-captcha: captcha bypass via Origin spoofing
`login-with-captcha/index.ts:125-151`. The Turnstile test secret (`1x0000…AA`, L129) is accepted
whenever `!isProductionOrigin(originHost)` (L148-150). `originHost` is derived from the request's
Origin/Referer header (`originHostFromRequest`), which an attacker scripting direct HTTP calls
fully controls. Sending `Origin: http://localhost` + Cloudflare's always-pass test token lets any
caller clear the CAPTCHA gate. Impact: defeats the bot / credential-stuffing defense this function
exists to provide; it does NOT grant access (valid credentials still required) and GoTrue's own
429 throttle remains. Evidence: CONFIRMED by reading the fallback branch. Fix: gate the test-secret
fallback on a server-trusted signal (deploy env / hostname of `SUPABASE_URL`), not a client header;
or drop the fallback in production builds.

### LOW
- **geo-hint** `index.ts:6-8` — inline CORS allow-headers omits `x-trace-id`. If invoked via `invokeEdge` the preflight fails (recruiting-center outage class, supabase/functions/CLAUDE.md). CONFIRMED. Fix: import `corsHeaders` from `_shared/http.ts`.
- **gumroad-backfill-all** `index.ts:21-25` — inline CORS omits `x-trace-id`; this fn is admin-invokable from the browser ("resync everyone" button). Same preflight risk. Fix: shared CORS owner.
- **gumroad-webhook** — shared secret travels as `?secret=` query param (L108). Query strings are prone to logging by CDNs/proxies. This is a Gumroad Ping limitation (only secret mechanism), and the compare is constant-time + seller_id matched, so accepted. Also L181 idempotency `select` drops `{error}` (ADR-0032), benign (falls through to idempotent upsert).
- **ingest-reference-csv** `index.ts:237` — service-role bearer compared with `token === SERVICE` (plain `===`, not constant-time). handoff-worker uses a constant-time `bearerMatches` for the same purpose. Fix: constant-time compare.
- **manage-discord-roles** — `action:"list"` requires only a valid JWT (any authenticated member can enumerate guild role names/ids). Low-sensitivity info exposure; mutations are correctly admin-gated.

## Payment-path verdict (gumroad-webhook / backfill / backfill-all / reconcile)
SOUND. gumroad-webhook: constant-time `safeEqual` on both the shared secret AND seller_id (fail-closed
403 + audit), zod + 16KB body cap, idempotent (sale_id fast-path + unique-upsert), ledger-only writes
(no tier written — DB trigger runs compute_membership), and a lifecycle event matching no ledger row
returns a retryable 409 (prevents refund-fraud "stuck membership"). backfill/backfill-all/reconcile all
key identity off the VERIFIED token email (never client-supplied) → no cross-buyer IDOR; subscription
lifecycle is fail-closed ("unknown" → pending, no self-restore). All four route error detail to the
audit sink and return static bodies (matrix err-leak flags here are FALSE POSITIVES). Only nits:
inline CORS on backfill-all (LOW) and secret-in-URL on the webhook (Gumroad-imposed, LOW).

## Handoff IDOR verdict
CONTROLLED. handoff-download re-checks ownership ON THE REQUEST (`handoff_is_active_member` on the
owning project, OR admin) before issuing a short-lived signed URL, and returns an identical `404`
for both missing and forbidden (no existence oracle); the bucket has no blanket read policy.
handoff-submit forces `created_by = user.id` (mass-assignment safe), validates files by magic bytes,
stores under a random object name, and gates on project membership. handoff-produce gates on
member/admin. handoff-worker is service-role-only with a constant-time bearer check. No IDOR found.

## Err-leak CONFIRMED vs REFUTED (vs coverage matrix, this batch)
- CONFIRMED (6): generate-discord-invite, guide-ingest, ingest-csv-knowledge, ingest-reference-csv, ingest-workshop-docs, grant-observer-role (partial — external Discord API text, not a stack trace).
- MATRIX FALSE NEGATIVE (1): manage-discord-roles (L474) leaks but matrix marked it clean.
- REFUTED despite matrix flag (7): gumroad-webhook, gumroad-backfill, gumroad-backfill-all, gumroad-reconcile, handle-email-suppression, handoff-worker, mark-interview-scheduled — all return static bodies and route the real error to audit/log.
Matrix err-leak precision in this batch is poor (regex sees `error.message` anywhere, incl. audit calls).

## Biggest limitation
Static review only — no execution, no deploy/secret inspection, and `supabase/config.toml`
`verify_jwt` per-function was not opened (classifications are inferred from in-code auth + the
`@edge-*` banner comments, which are advisory, not authoritative). The login-with-captcha bypass
and gumroad constant-time claims were read, not dynamically tested. `_shared` helpers
(`discordFetch`, `authorizeServiceRoleRequest`, `handoff_is_active_member` RPC, `applyWaf`,
`verifyWebhookRequest`) were treated as correct by their contracts, not independently verified.
