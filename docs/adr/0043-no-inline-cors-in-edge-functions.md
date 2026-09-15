# ADR 0043 — Edge functions may not hand-roll CORS; a guard forbids inline CORS

- Status: Accepted
- Date: 2026-09-15
- Deciders: TechFleet (owner)
- Related: `scripts/ci/check-no-inline-cors.mjs` + `scripts/ci/no-inline-cors-grandfather.json` + `src/test/smoke/check-no-inline-cors.smoke.test.ts` (the guard), `supabase/functions/_shared/http.ts` (the shared CORS owner), `scripts/ci/check-edge-cors-trace.mjs` (the invokeEdge-target CORS guard it complements), ADR-0028 (invokeEdge / error-shape), `supabase/functions/CLAUDE.md` ("inline CORS is banned"). Skills: `arch-encode`, `owasp-secure-coding-bdd`, `enterprise-architecture-standards`, `release-deployment-safety`.

## Context and problem statement

`invokeEdge` attaches an `x-trace-id` header to every browser→edge call. A browser therefore lists `x-trace-id` in the CORS preflight; if the target function's `Access-Control-Allow-Headers` omits it, the browser **blocks the POST** — `FunctionsFetchError`, zero edge-side logs, the function never runs. This is not hypothetical: it took down the Recruiting Center status update and 7 other flows the day their callers migrated to `invokeEdge`, because those functions hand-rolled a CORS block that predated `x-trace-id`.

`check-edge-cors-trace.mjs` (ADR-adjacent) closes this for functions that are **already** `invokeEdge` targets. But a function that hand-rolls CORS today is a **latent** outage: the bomb is armed and detonates whenever its client later converts to `invokeEdge` (which the Phase-1 raw-invoke burn-down is doing across ~50 sites). The shared owner `supabase/functions/_shared/http.ts` already exports a correct `corsHeaders` (lists `x-trace-id` + `x-request-id`), and `CLAUDE.md` already says "inline CORS is banned" — but nothing **mechanically** stopped a function from hand-rolling it. The rule lived only in prose.

## Decision drivers

- **Fail-safe, structural, not prose.** A CORS-preflight outage must be impossible to introduce, not merely discouraged by a doc.
- **Catch the latent bomb early** — at the moment inline CORS is written, not later when a client converts and prod breaks.
- **No dependency on prod or a live DB** — a static CI check from any clone (like the other schema/edge gates).
- **Shrink-only ratchet** — a large pre-existing backlog exists (webhooks/cron/auth functions that predate the shared owner); block _new_ offenders and _burn down_ the old ones, never allow the count to grow (the raw-invoke budget pattern, ADR-0028).

## Considered options

1. **Rely on `check-edge-cors-trace` + the CLAUDE.md prose.** Rejected: `check-edge-cors-trace` only covers _current_ invokeEdge targets, so a hand-rolled function is invisible to it until its client converts — exactly when it's too late (prod outage). Prose isn't enforcement.
2. **Migrate all ~90 functions to the shared owner in one PR, no guard.** Rejected: a huge, conflict-prone, unreviewable change, and nothing stops the _next_ function from hand-rolling CORS again. Fixes instances, not the class.
3. **Add a blocking guard forbidding inline CORS + a shrink-only grandfather (chosen).** A static guard fails CI if any edge function sets `Access-Control-Allow-Headers` without importing from `_shared/http.ts`, with a shrink-only allowlist for the pre-existing backlog. New inline CORS is impossible; the backlog can only shrink toward zero.

## Decision outcome

**Chosen: Option 3.**

- **`scripts/ci/check-no-inline-cors.mjs`** (blocking, in `gate-verify` — which checks out `fetch-depth: 0` so the shrink-vs-`main` diff works): for every `supabase/functions/<name>/index.ts`, if it sets `Access-Control-Allow-Headers` it MUST import CORS from `../_shared/http.ts`. A function may still spread/extend the shared set for a bespoke header (e.g. `send-community-agreement-trigger` merges `x-internal-secret`) — compliant _because_ it imports the owner. Three failure modes: a new/unallowlisted inline-CORS function; an allowlist that **grew** vs `main`; a **stale** allowlist entry (function migrated → must be removed). Fails closed on a missing functions root, an unreadable allowlist, a zero-function scan, or an unresolvable base ref.
- **`scripts/ci/no-inline-cors-grandfather.json`** seeds the 54 functions that still hand-roll CORS (all non-browser-invoked today — webhooks/cron/auth — so none are current `invokeEdge` targets). Registered as a bespoke reader in `check-ci-guard-integrity.mjs`; pinned by an 8-scenario smoke test.
- Complements `check-edge-cors-trace`: this one bans the pattern for _every_ function; that one proves _current_ targets allow `x-trace-id`. Together the preflight-drift outage class is structurally dead.

## Consequences

**Good**

- A CORS-preflight outage can no longer be introduced: a hand-rolled block fails CI the moment it's written, years before the client that would trip it converts.
- The ~90-function inline-CORS backlog is now tracked and monotonically shrinking (Phase-4 edge consolidation), not an invisible liability.

**Bad / accepted**

- The guard checks _sourcing_ (imports the owner), not that the effective headers are byte-perfect — a function could import the owner and then override `Access-Control-Allow-Headers` back to something broken. Accepted: that override would itself be flagged unless it references the shared value, and `check-edge-cors-trace` still proves `x-trace-id` for any function that becomes a browser target. The two layers cover both "hand-rolled" and "target incomplete."
- The grandfather is hand-maintained and starts large (54). Accepted: same reviewed-ratchet cost as every allowlist in the repo; it can only shrink.

## Confirmation

- `src/test/smoke/check-no-inline-cors.smoke.test.ts` (11 scenarios): all-shared→0, grandfathered→0, new-offender→1, grew-vs-base(seam)→1, stale-entry→1, shared-extend→0, missing-root→2, real-repo→0, imports-owner-but-hard-codes-a-literal→1 (blind-spot), grew-vs-REAL-git-base→1, unborn-base→2 (fail-closed). The last two `git init` a fixture so `baseAllowlist()`'s real git path + its fail-close are exercised, not just the env seam. Discriminates under the mutation gate.
- `check-guard-has-test` + `check-guards-wired` + `check-ci-guard-integrity` all green with the new guard (registered as a bespoke dir-reader).
