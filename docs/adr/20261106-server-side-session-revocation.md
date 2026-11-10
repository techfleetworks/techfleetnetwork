# ADR 20261106 — Server-side session revocation enforced at the edge (RH1 / SEC-1)

- Status: accepted
- Date: 2026-11-06
- Deciders: engineering (enterprise-readiness remediation, Wave 1 / RP-B)

## Context

The re-audit (`docs/audit/reaudit-2026-10-30/`, finding **RH1 / SEC-1**, High) found that session
revocation did not revoke anything on the **server**. Three member- and admin-facing paths —
self-service "sign out all devices", admin revoke, and the emergency global sign-out — are supposed
to be a kill switch. They were not.

Two defects added up:

1. **The GoTrue admin call cannot work.** Four handlers call `admin.auth.admin.signOut(<userId>, "global")`.
   In supabase-js v2, `GoTrueAdminApi.signOut(jwt, scope)` takes the user's **access-token JWT**, not a
   user id. A UUID is not a JWT, so the call fails on every invocation, and each call site swallows that
   error (logged "non-fatal", `.catch(() => undefined)`, or pushed to `failures`).
2. **The only revocation that took effect ran in the browser.** The durable owner of the revocation fact
   is `public.is_session_revoked(user, issued_at)` over `public.revoked_sessions`. Its **only reader** was
   `src/features/auth/services/session.service.ts#getSession()` — client JS. `grep` found no reference in
   `supabase/functions/_shared/request-auth.ts` and no RLS policy that calls it.

An attacker with a stolen access or refresh token is not using our SPA. They call PostgREST and edge
functions directly, so a check that runs only in the browser never sees them. They keep access after the
victim's "sign out everywhere", an admin revoke, and the emergency global sign-out — each of which reports
success. This is OWASP Session Management (server-side invalidation), and it neuters incident response.

The revocation data owner already exists in prod: `is_session_revoked(uuid, timestamptz)` and the
`revoked_sessions` table/`revoke_before` column are live (migrations `20260416212128`, `20260428032029`,
`20260602205135`), granted to `authenticated` and `service_role`. What was missing was a **server-side
reader**.

## Decision

Enforce revocation on the server, at the one shared authentication boundary, keeping the DB function as
the single owner of the fact.

1. **`requireAuthenticatedRequest` (`supabase/functions/_shared/request-auth.ts`) now reads the owner on
   every authenticated edge call.** After the JWT claims are validated, it derives the token's issued-at
   from the token's own `iat` claim and calls `is_session_revoked(_user_id, _issued_at)`. A revoked session
   → **401 Unauthorized** before any handler logic runs. This is the smallest change that makes every
   function routed through the shared helper honor revocation, with no new abstraction and no second copy
   of the predicate (data ownership stays with the DB function; the edge is just another reader, like the
   SPA).

2. **Fail closed, but distinguish "revoked" from "cannot verify".**
   - RPC error → **503** (retryable). Deliberately **not 401**: a transient DB error must not read as a
     credential verdict that forces a client sign-out — that is the June 2026 lockout class this repo's
     frozen-auth lockdown exists to prevent. The request still does not proceed as authenticated (fail
     closed), and the error is reported to the audit sink (`reason:revocation_check_failed`), not swallowed.
   - A validated JWT with no numeric `iat` → **401** (unverifiable, audited `reason:missing_iat`). A real
     GoTrue token always carries `iat`, so this is an anomaly, not a normal path.
   - A revoked session → **401** (audited `reason:session_revoked`).

3. **Prevent-by-construction guard.** `scripts/ci/check-session-revocation-enforced.mjs`
   (SESSION-REVOCATION-ENFORCED-001, `// ci-lane: bespoke` — it diffs the grandfather against
   `origin/main`, so it rides the `gate-verify` job's `fetch-depth: 0` checkout via a dedicated step,
   like `check-no-inline-cors`, not the shallow-checkout critical matrix) enforces two invariants and
   fails closed:
   - **(A)** `request-auth.ts` MUST contain a live `.rpc("is_session_revoked", ...)` call — deleting the
     server check (reverting to client-only revocation) fails CI.
   - **(B)** no NEW `*.auth.admin.signOut(` call site may appear in `supabase/functions`; the four that
     predate this work sit on a shrink-only grandfather (`session-signout-grandfather.json`).
   Pinned by `src/test/smoke/check-session-revocation-enforced.smoke.test.ts` (8 cases tying each exit code
   to a behavior, so the suite reddens if the guard is no-op'd — the `verifiable-quality-gates`
   discrimination requirement). A node-runnable discrimination proof was run before merge (every bad case —
   check removed, new signOut, grown grandfather, stale entry, missing `request-auth.ts` — is caught).

4. **`issuedAtIsoFromClaims` is a pure, exported, unit-tested helper** (`request-auth.test.ts`): `iat`
   present → issued-at ISO; absent/non-numeric → `null` so the caller fails closed. This keeps the one
   piece of new logic that is not a DB call deterministically testable without network.

5. **@security scenario** added (`supabase/functions/_shared/session-revocation.feature`): a stolen access
   token must be rejected at the edge after revocation; the cannot-verify path fails closed.

## Scope and what is deliberately NOT in this change

- **Admin / other-user revocation (the refresh-token-delete RPC) is OUT of scope — it is prod-blocked.**
  The complete SEC-1 fix also needs a `SECURITY DEFINER` RPC that deletes `auth.refresh_tokens` /
  `auth.sessions` for a target user id (so self-revoke/admin-revoke actually tear down the refresh token,
  not just block the access token at the edge). That migration is **hand-applied to prod** (migrations here
  are forward-only and hand-applied — see ADR-0036 / `supabase/migrations/CLAUDE.md`) and cannot be
  verified from this box. It is **not faked here.** The four `admin.signOut(` call sites are therefore left
  as tracked debt on the shrink-only grandfather, not rewritten. **This is safe because the edge-side
  enforcement added here already defends the stolen-token path** for every function behind the shared
  helper: even while a stolen refresh token can still mint a new access token at GoTrue, every resulting
  access token is rejected at the edge once `revoked_sessions` covers it. The refresh-token teardown is the
  defense-in-depth follow-up, filed against the grandfather burndown.
- **The client boot block and auth UI are untouched** (frozen-auth lockdown). `session.service.ts` keeps
  its own client-side check; this ADR adds the server reader beside it, it does not move or weaken the
  client one.

## Consequences

- **Positive.** The revocation kill switch now works against the attacker it exists for (direct API access
  with a stolen token), for every edge function routed through `requireAuthenticatedRequest`. The control
  is enforced at the layer that owns the request boundary, with one DB owner of the fact, and cannot
  silently regress (guard + discrimination test).
- **Cost / latency.** Every authenticated edge call now does one extra DB round-trip (an indexed single-row
  `EXISTS` on a small table; `requireAdminRequest` now does getClaims + is_session_revoked + has_role). This
  is accepted: it is the same shape the SPA already pays per `getSession`, and revocation enforcement is not
  optional for a production auth boundary. A short-TTL negative cache is a possible future optimization if
  profiling shows it matters.
- **Availability.** A `revoked_sessions`/RPC outage degrades authenticated edge traffic to 503 (retryable),
  not to a forced sign-out. This is the intended fail-closed-but-not-lockout posture.
- **Not yet universal.** Functions that do their own inline auth (not through the shared helper) are not
  covered by this change; routing them through `requireAuthenticatedRequest` is part of the separate
  inline-authz / service-role-read burndown (SEC-7 / SEC-8).

## Verification

- `node scripts/ci/check-session-revocation-enforced.mjs` → OK (server check present; 125 functions
  scanned; 4 grandfathered).
- `node scripts/ci/check-ci-guard-integrity.mjs` and `node scripts/ci/check-guards-wired.mjs` → OK with the
  new guard (critical lane).
- Node discrimination proof → all 7 cases pass (PASS on clean/grandfathered; FLAG on check-removed /
  new-signOut / grown-grandfather / stale-entry; fail-closed on missing `request-auth.ts`).
- `request-auth.test.ts` adds `issuedAtIsoFromClaims` cases. The auth regression suite and the full
  required CI matrix are the source of truth and must be green before merge (this box cannot run Deno /
  vitest).

## Limitation

SEC-1's runtime claims (that GoTrue `signOut` fails on a user id, and whether GoTrue revokes refresh tokens
on a password change) are **inferred** from the documented SDK signature, not observed in prod. The cheapest
upgrade is to read the `gotrue_signed_out` field in `sign-out-all-devices` logs. That does not affect this
change: the edge-side `is_session_revoked` enforcement is correct regardless of GoTrue's behavior.
