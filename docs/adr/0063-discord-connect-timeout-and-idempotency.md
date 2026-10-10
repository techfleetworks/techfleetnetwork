# ADR 0063 — Discord-connect: bound live-Discord calls under a registered client budget, make the OAuth callback idempotent

- Status: Accepted
- Date: 2026-09-27
- Deciders: Morgan Denner
- Epic: Discord integration / reliability

> Numbering: origin/main is at ADR-0061. 0058 + 0059 (applicant-status fan-out) and 0062
> (System Health cleanup) are reserved by in-flight branches, so this takes 0063.

## Context

Users reported the Discord-connect flow — both the profile connector
(`ProfileDiscordConnector`, used by Profile Setup / Edit Profile / General Application) and the
Discord-connect course (`DiscordCoursePage` → `ObserverRoleOptInCard`) — "erroring out": they
could not get an invite link, and the connect flow appeared to fail.

Investigation against production (project `pzvqxdgoztbfikfuifix`) + 30 days of `public.audit_log`
found the reported August cause (the `discord_oauth_states` table + `create/consume_discord_oauth_state`
RPCs missing from prod) was **not** current — those objects exist and OAuth linking works
(129 `discord_link_verified_oauth` in 30 days). The live faults are two, sharing one class:

**1. Live-Discord edge functions abort under the 8s client default.**
`invokeEdge` applies an **8s default** client timeout to any function not in the
`EDGE_FUNCTION_TIMEOUTS_MS` registry (`src/lib/edge/edge-timeouts.ts`). `discordFetch`
(`supabase/functions/_shared/discord-fetch.ts`) retries with exponential backoff and honors a 429
`Retry-After` for **up to 15s per retry** — so a single rate-limited channel already exceeds 8s.
The raw-invoke burn-down (ADR-0028) migrated `generate-discord-invite` (and five siblings) to
`invokeEdge` **without** a registry entry, silently capping a multi-call bot operation at 8s. The
client aborts with `TimeoutError` while the bot keeps running (orphan invites + a false "couldn't
get an invite link"). `audit_log` confirms it: `edge_invoke_failed / "Edge function
generate-discord-invite timed out"`, plus real timeouts for `notify-applicant-status` and
`grant-observer-role`. Six browser-invoked `discordFetch` functions were unregistered; only
`get-discord-member-count` was correctly registered.

**2. The OAuth callback reports failure to users who are already linked.**
30 days showed 27 `discord_link_state_rejected` (all `reason:invalid_or_used`) vs 129 successes
(~17%). The OAuth `state` is single-use; a page refresh / double-mounted callback / back-navigation
re-runs the exchange with the now-consumed state, and `discord-oauth-callback` returned a hard
`invalid_state` error — an alarming failure card shown to a user whose account the _first_ call
already linked.

A third finding: the legacy username-search bind (`DiscordNotifyService.resolveDiscordId` /
`confirmDiscordId`, calling the `resolve-discord-id` edge function) has **zero UI callers** — it was
replaced by OAuth (audit H11) and left as dead code.

## Decision

**Boundary/data note:** the timeout budget belongs to the _function_, not the call site; the OAuth
identity write stays server-owned in the callback. No security, RLS, or validation was weakened.

1. **Register every browser-invoked `discordFetch` function in `EDGE_FUNCTION_TIMEOUTS_MS`**
   (`generate-discord-invite`, `manage-discord-roles`, `repair-discord-username`,
   `backfill-discord-usernames`, `notify-applicant-status`, `grant-observer-role`). One line each;
   every current and future call site inherits the budget.

2. **Bound the server so it can never outrun the client.** `discordFetch` gains an optional
   `totalBudgetMs` that caps total wall-clock across attempts + backoff sleeps and aborts each
   network attempt at the remaining budget (undefined = historical unbounded behavior).
   `generate-discord-invite` runs under `INVITE_TOTAL_BUDGET_MS = 12_000`, below its client budget
   (`15_000`), so the server always finishes — success or clean failure — before the browser aborts.

   This bound is now applied to **four** of the five sibling handlers as well (this change; see the
   "Server bounds for the sibling handlers" section below), each ~3s under its registered client
   budget. `notify-applicant-status` is intentionally **deferred** — its inline Discord calls are
   being removed by the in-flight ADR-0058/0059 fan-out rework, so bounding them here would only add
   a server bound to code that branch deletes.

3. **New structural guard `check-edge-timeout-coverage.mjs`** (ci-lane: standard; pinned by
   `src/test/smoke/check-edge-timeout-coverage.smoke.test.ts`): any browser-invoked `discordFetch`
   function that is not registered fails the gate. This is what makes the class "structurally
   impossible to recur" — it caught `grant-observer-role`, which manual review missed. It found the
   bug; the registry fixes it.

4. **Make `discord-oauth-callback` idempotent.** On `invalid_or_used`, if the authenticated caller
   already has `discord_user_id` set, return success (`idempotent: true`) and audit
   `discord_link_idempotent_replay` instead of the error. Only the caller's own profile is read;
   nothing is written. Genuine never-linked expiry still returns the friendly, actionable error.

5. **Delete the reachable dead code** (`resolveDiscordId` / `confirmDiscordId`), then **fully
   undeploy the now caller-less `resolve-discord-id` edge function** — see the 2026-09-27 addendum
   below. The H11-001 security invariant it guarded is preserved by generalizing the guard, not by
   keeping a dead function alive to be scanned.

## Consequences

- **Positive:** the reported invite failure is fixed deterministically; five sibling latent 8s
  bugs are fixed at once; already-linked users no longer see false errors on refresh/replay; the
  guard prevents the whole class from recurring; a chunk of the 17% rejection rate becomes success.
- **Honest limits (not "impossible to fail ever"):** Discord API outages, rate limits, an expired
  bot token/secret, or DNS can still fail — these now fail _fast and bounded_ rather than hanging or
  showing a dead button. Genuinely-expired OAuth states (user idle > 10 min) still error, correctly.
- **Cost:** `discordFetch`'s optional `totalBudgetMs` adds a small amount of shared-wrapper logic
  (backward-compatible; unbounded when unset). The unregistered siblings other than the invite are
  fixed by raising the client budget only; bounding _their_ servers via `totalBudgetMs` is a
  fast-follow the guard now makes safe to defer.
- **Follow-ups:** (a) ~~undeploy `resolve-discord-id`~~ — **done, see addendum below** (repo side
  complete; one manual prod delete remains); (b) ~~consider `totalBudgetMs` for the other five
  server handlers~~ — **done for four; see "Server bounds for the sibling handlers" addendum below**
  (`notify-applicant-status` deferred to the ADR-0058/0059 fan-out branch); (c) the DB-object drift
  class (the August cause) is covered separately by the `environment_readiness` critical-objects check.

## Addendum (2026-09-27) — Server bounds for the sibling handlers

Follow-up (b) executed for four of the five siblings. Each still calls `discordFetch` from the
browser-invoked path, so under sustained Discord 429s (backoff can sleep up to 15s/retry ≈ 45s over
three retries) an _unbounded_ server could still outrun its raised client budget — just at a rarer
threshold than the 8s default. Each now passes `totalBudgetMs`, held ~3s below its registered client
budget in `src/lib/edge/edge-timeouts.ts`, so the server finishes (success or clean failure) before
the browser aborts:

| Function                     | Client budget | Server bound                                                                           | Shape                                                                                                                                                                                                                                   |
| ---------------------------- | ------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manage-discord-roles`       | 15s           | `ROLES_TOTAL_BUDGET_MS = 12s`                                                          | one `discordFetch` per request (list/create/assign/remove) → full budget per call                                                                                                                                                       |
| `repair-discord-username`    | 15s           | `REPAIR_TOTAL_BUDGET_MS = 12s`                                                         | single member fetch                                                                                                                                                                                                                     |
| `grant-observer-role`        | 15s           | `OBSERVER_TOTAL_BUDGET_MS = 12s`                                                       | two sequential grants **share** one budget from a common start clock; a grant with no budget left is reported as recoverable and queued for the existing self-healing retry, not silently dropped                                       |
| `backfill-discord-usernames` | 60s           | `BACKFILL_TOTAL_BUDGET_MS = 57s` overall + `BACKFILL_PER_ITEM_BUDGET_MS = 8s` per item | bulk loop; each item capped at `min(per-item, overall-remaining)`; when the overall budget is spent the loop stops early and **reports** `stopped_early` + `unprocessed` so the admin re-runs — the `DiscordRepairTab` UI surfaces both |

**Why per-function constants, not a call-site number:** the budget is a property of what the
function _does_ (single call vs. two sequential vs. a bulk loop), so it lives beside that logic and
each stays coupled to — and below — its own registry entry. The client-side registry comments now
name each server bound so the two numbers are read together.

**`notify-applicant-status` deferred (coordination, not an oversight).** On the in-flight
`feat/applicant-status-event-fanout` branch (ADR-0058/0059) this function is being reduced to a
**write-only shim**: it forwards to the `change_applicant_status` RPC and does _no_ inline sends. The
Discord role assignment + welcome post move to the cron-poked `process-applicant-workflow-events`
worker, which has **no browser client waiting on it**, so the "server must finish before the client
aborts" contract does not apply there — its bounding is a different concern owned by that ADR. Adding
`totalBudgetMs` to the current inline calls here would bound code that branch deletes, creating pure
merge friction. Its registry entry (`20s`) stays as the raised client budget until the fan-out lands.
When it does, the worker's own live-Discord calls should be bounded to its execution/cron budget
under ADR-0058/0059.

**Tests:** `supabase/functions/_shared/discord-fetch.test.ts` (already in the CI deno-test
allowlist) is extended with the two wrapper behaviors these handlers newly rely on — aborting a hung
in-flight fetch at the remaining budget, and bounding exponential backoff on repeated 5xx with no
`Retry-After`. The existing `check-edge-timeout-coverage` guard and registry invariant still pass.

**Pinning the server-below-client invariant.** The correctness of every bound rests on one
relationship: each function's server `*_TOTAL_BUDGET_MS` must stay below its registered _client_
budget. Those two numbers live apart (a Deno-handler const vs. `EDGE_FUNCTION_TIMEOUTS_MS`), so
`src/test/lib/edge-timeouts.test.ts` now reads each of the five constants from disk and asserts it is
at least 2s below the registry value, failing closed if a const is renamed/removed. Without this,
tightening a client budget later while leaving the server const untouched would silently re-create
the outage — server > client → server outruns the browser under a 429 storm — with no test going red.
This pins the invariant the same way `check-edge-timeout-coverage.mjs` pins the sibling one.

## Addendum (2026-09-27) — `resolve-discord-id` fully undeployed

Follow-up (a) executed. Confirmed zero callers first: no `.functions.invoke`/`invokeEdge`
call site in `src/`, no reference in `supabase/functions/`, and no cron/`config.toml` schedule
targets it. The only remaining mentions were the client comments, a stale test-list entry, and
the H11 guard — all handled below.

**Repo changes (this branch):**

- Deleted `supabase/functions/resolve-discord-id/` (`index.ts`, `result-classifier.ts`,
  `result-classifier.test.ts`). `result-classifier` had no importer outside that dir.
- Removed the `[functions.resolve-discord-id]` block from `supabase/config.toml`.
- Regenerated all three manifests via `node scripts/ci/check-edge-function-coverage.mjs --fix`
  (`supabase/functions.manifest.json`, `src/generated/edge-functions.manifest.json`,
  `supabase/functions/edge-deploy-smoke/_manifest.json`) — 129 functions, `resolve-discord-id`
  gone from all three.
- Dropped `resolve-discord-id` from the `MIGRATED` list in
  `src/test/edge/cors-shared-owner.test.ts` and from the pentest target list in
  `scripts/pentest/edge-functions.mjs` (both would otherwise read the deleted dir / target a
  dead function).

**H11 invariant preserved by generalization, not deletion.** The old H11-001 assertion read
`resolve-discord-id/index.ts` directly — deleting the file would have silently dropped the
guard. It is rewritten in `src/test/smoke/discord-link-ownership.smoke.test.ts` to scan the
**entire** edge-function surface and assert (1) no function contains the legacy caller-supplied
bind `discord_user_id: confirm_user_id`, and (2) exactly one function writes the profile-link
flag `has_discord_account: true`, and it is `discord-oauth-callback`. This is strictly stronger
than the original: it now catches a reintroduction in _any_ function, existing or new, not just
in the one we deleted. H11-002/003 (the callback binds only the OAuth-verified `decision.snowflake`
and never a value from the request body) are unchanged.

**Manual prod step (NOT done by this branch — requires prod credentials):** the edge-function
deploy workflow (`.github/workflows/deploy-edge-functions.yml`) only _deploys_ present functions;
it never deletes removed ones, so the function stays live in prod until explicitly deleted. After
this merges, run against project `pzvqxdgoztbfikfuifix`:

```
supabase functions delete resolve-discord-id --project-ref pzvqxdgoztbfikfuifix
```

Then confirm `GET /functions/v1/resolve-discord-id` returns 404.

**Deferred (out of scope here):** `normalizeDiscordSearchInput` in `src/lib/discord/username.ts`
is now orphaned (only its own unit test references it) since the username-search flow was removed;
its sibling `isUsableDiscordUsername` is still live. The stale e2e `e2e/discord-verification.e2e.ts`
mocks the deleted function and exercises the removed candidate-selection UI. Both are dead as a
result of ADR-0063 but left for a separate cleanup so this teardown stays reviewable.
