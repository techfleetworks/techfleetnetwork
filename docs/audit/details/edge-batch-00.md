# Edge-function security audit — batch-00 (23 functions)

Reviewer: skeptical app-sec engineer. Read-only. Code root: `C:/Users/morga/Documents/tfn-audit`.
Each `supabase/functions/<name>/index.ts` read in full + `config.toml` verify_jwt + shared helpers
(`_shared/service-role-auth.ts`, `_shared/admin-step-up.ts`, `_shared/request-auth.ts` usage).

Verdict up front: **no CRITICAL, no HIGH.** Every privileged `verify_jwt=false` function enforces a
real in-code check. The two mass-destructive admin functions are gated by `has_role` **and** fresh-2FA
step-up. Findings are MEDIUM/LOW: error-text leakage in responses (several, all on auth-gated or
service-role surfaces) and one documented-but-missing rate limit on the public auth broker.

## (a) Per-function table

| function | classification | authN ok? | authZ / IDOR | input-valid | err-leak confirmed? | worst issue |
|---|---|---|---|---|---|---|
| admin-purge-auth-user | ADMIN (jwt=false,in-code) | YES has_role+2FA | OK (self-delete + last-admin guards) | YES zod+regex | **CONFIRM** (listUsers err→500 static; but see F) | leaks `error.message` only in step-up path? no — static; minor |
| admin-sign-out-all-users | ADMIN (jwt=false,in-code) | YES has_role+2FA | OK (global, intended) | n/a | **CONFIRM** (`error.message` L48/63; `failures[].error` L69,81) | GoTrue err text in body (M) |
| auth-broker | PUBLIC (jwt=false) | YES (per-route zod + GoTrue) | OK (recovery-session bound) | YES zod | REFUTE (codes only, never message) | no app-level rate limit vs config claim (M) |
| auth-email-hook | WEBHOOK (jwt=false) | YES StandardWebhooks sig | OK | YES payload shape | **CONFIRM** (`tokenError.message` L279; catch `error.message` L340) | err text in body post-sig (L) |
| auth-prober | CRON (jwt=false) | YES service-role helper | OK | n/a | REFUTE (static) | none |
| auth-reset-smoke | CRON (jwt=false) | YES service-role helper | OK | n/a | **CONFIRM** (`detail.error`=msg/String(e) in body) | err text, svc-role only (L) |
| backfill-discord-usernames | ADMIN (jwt=true) | YES getClaims+has_role | OK | OK | not-flagged → **found** (`errors[].reason`=err.message L183) | err text, admin-only (L) |
| bump-email-warmup | CRON (jwt=false) | YES exact bearer==svc key | OK | n/a | **CONFIRM** (`error.message` L43/79) | err text, svc-role only (L) |
| check-account-identity | PUBLIC (jwt=false) | YES turnstile+RL+fail-closed | OK (booleans only, no row) | YES zod | REFUTE (static) | none — exemplary |
| client-rate-limit-log | PUBLIC telemetry (jwt=false) | n/a (log sink) | OK | YES enum+size cap | REFUTE | none |
| confirm-admin-role | PUBLIC grant-confirm (jwt=false) | YES bearer-owner+hashed single-use token+origin | OK (owner-bound) | YES TOKEN_RE | REFUTE (static; console only) | none |
| confirm-teacher-role | PUBLIC grant-confirm (jwt=false) | YES (same as above) | OK | YES | REFUTE | none |
| delete-account | USER-AUTH (jwt=false,in-code) | YES getUser | OK (self only) | n/a | REFUTE (static) | none |
| discord-interactions | WEBHOOK (jwt=false) | YES nacl ed25519 + freshness | OK (egress env-fixed, no SSRF) | YES len caps | REFUTE (msg logged, Discord reply static) | none |
| discord-notify | USER-AUTH (jwt=false,in-code) | YES requireAuthenticatedRequest | OK (acts as caller) | YES origin+size+enum | REFUTE (generic) | none |
| discord-oauth-callback | USER-AUTH (jwt=false,in-code) | YES requireAuth + single-use state | OK (binds caller only; /users/@me proof) | YES len caps | REFUTE (static errors) | PostgREST `.or()` interpolation L256 (L) |
| discord-oauth-start | USER-AUTH (jwt=false,in-code) | YES requireAuth | OK | YES origin allowlist | REFUTE | none |
| discord-project-update | ADMIN (jwt=false,in-code) | YES getUser + role | OK | YES zod+size | not-flagged → **found** (`error: message` L246-247) | **hand-rolled role CONFIRM** (direct user_roles query) + err leak (L) |
| dsar-submit | USER-AUTH (jwt=false,in-code) | YES getUser | OK (RPC under caller JWT) | YES enum | **CONFIRM** (`rpcErr.message` L70) | err text, authed (L) |
| edge-deploy-smoke | CRON (jwt=false) | YES service-role helper | OK | n/a | REFUTE (static) | none |
| email-dispatcher | CRON (jwt=false) | YES service-role helper | OK | n/a | REFUTE (auth.error static) | no top-level try/catch (wrapper covers) |
| email-octopus-sync | CRON (jwt=false) | YES exact bearer==svc key | OK | n/a | REFUTE (inner msgs thrown/logged, body static) | none |
| email-pipeline-health | CRON (jwt=false) | YES exact bearer==svc key (forgeable-JWT path removed) | OK | n/a | **CONFIRM** (`results[].error`=msg in body L135) | err text, svc-role only (L) |

## (b) Findings

**MEDIUM**

- **M1 · auth-broker · config.toml:135-142 + index.ts handleSignInPassword/handleSignUp/handleResetRequest**
  — Documented per-IP/per-email rate limit via `peek_rate_limit` is **not implemented**; the handlers
  call GoTrue directly and `captchaToken` is optional in the zod schemas. The only throttle on this
  public credential-stuffing / enumeration surface is GoTrue's own server-side limiter.
  Evidence: **VERIFIED** (no rate-limit call anywhere in index.ts; schema marks captcha optional).
  Limitation: GoTrue's configured limits not inspected — it is a backstop, so impact is reduced, not nil.
  Smallest fix: add `peek_rate_limit`/`check_rate_limit` per (ip,email,route) before the GoTrue call,
  OR correct the config comment to state GoTrue is the sole limiter (stop over-claiming the control).

- **M2 · admin-sign-out-all-users · index.ts:48,63,69,81** — raw GoTrue `error.message` returned in the
  response body (`json({ error: error.message }, 500)` and `failures[].error`). Admin + fresh-2FA gated,
  so disclosure is to a trusted operator, but it violates decisions.md §8 "an edge error response never
  carries the error." Evidence: **VERIFIED**. Fix: log the error, return a static message; keep the
  per-user failure list as `{user_id}` without the provider text.

**LOW** (all are decisions.md §8 "error response never carries the error" on auth-gated or service-role
surfaces — low disclosure risk, same one-line fix each: log it, return a static message)

- **L1 · auth-email-hook:279,340** — `mint_unsubscribe_token: ${tokenError.message}` and top-level
  `catch → error.message`. Reachable by GoTrue (sig-verified) / unverified top-level catch. VERIFIED.
- **L2 · auth-reset-smoke:60,90,100,105** — `detail.error` = `error.message`/`String(e)` echoed in body.
  Service-role only. VERIFIED.
- **L3 · bump-email-warmup:43,79** — `error?.message` / `updErr.message` in body. Service-role only. VERIFIED.
- **L4 · email-pipeline-health:135** — `results.push({ error: msg })` returned in body. Svc-role only. VERIFIED.
- **L5 · dsar-submit:70** — `json({ error: rpcErr.message }, 500)`. Authenticated user. VERIFIED.
- **L6 · discord-project-update:246-247** — `error: message` (= err.message) in 500 body. Admin-gated.
  **Not flagged by the heuristic matrix.** VERIFIED.
- **L7 · backfill-discord-usernames:183** — `errors[].reason = (err as Error).message` returned. Admin+jwt.
  **Not flagged by the matrix.** VERIFIED.
- **L8 · discord-project-update:114-119** — **hand-rolled admin check**: queries `user_roles` table
  directly instead of the shared `has_role`/`requireAdminRequest` predicate (CLAUDE.md "No inline admin
  checks"). Functionally correct (checks role=admin for the caller) and **not bypassable**, but it is the
  one genuine hand-rolled role check in the batch. VERIFIED. Fix: route through `has_role` RPC like the
  sibling admin functions.
- **L9 · discord-oauth-callback:256** — `.or(\`discord_user_id.eq.${snowflake},discord_username.ilike.${identity.username}\`)`
  interpolates Discord-API values into a PostgREST filter string. Discord's username charset (a-z,0-9,_,.)
  disallows the `,`/`()` that would break out, and `snowflake` is numeric, so practically safe but fragile.
  Evidence: **INFERRED** (Discord charset rules not re-verified against the live API). Fix: use builder
  `.or()` with `.eq`/`.ilike` chained, or sanitize before interpolation.

**Non-findings explicitly checked (REFUTED heuristic flags in this batch)**
- Hand-rolled role REFUTED for admin-purge-auth-user, admin-sign-out-all-users, backfill-discord-usernames
  (all call the `has_role` RPC — canonical predicate, just not via the `requireAdminRequest` TS wrapper),
  and confirm-admin-role/confirm-teacher-role (grant-confirmation via hashed single-use token + shared
  `evaluateConfirmation`, not an authz check).
- Err-leak REFUTED for discord-interactions, email-octopus-sync (error text is logged/thrown internally;
  the HTTP response body is static).
- `admin-sign-out-all-users` "no top-level try/catch" is covered by `withAuditWrapper`; not a defect.

**Secret handling:** no service-role key or other secret is logged or returned anywhere in the batch.
Internal calls (discord-interactions → techfleet-chat) pass the service key as a Bearer to the gateway
plus `x-fleety-internal`; egress targets are env-derived (no SSRF). `service-role-auth.ts` exact-matches
in constant time (the forgeable unsigned-JWT fallback was removed, audit C1). `admin-step-up.ts` requires
`aal2` **and** a fresh `two_factor_login_sessions` row keyed by the SHA-256 of the real bearer — the
unverified `aal` claim alone cannot satisfy it.
