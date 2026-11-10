# ADR 20261110 — Prove no SECURITY DEFINER function is anon-executable (DB-1 completeness)

- Status: accepted
- Date: 2026-11-10
- Deciders: repo owner (mdenner), in session
- Relates to: re-audit 2026-10-30 (DB-1 / RP-I), `supabase/tests/security_definer_exposure_test.sql`
  (the hand-list predecessor), ADR 20261110-deno-test-coverage (RP-H TST-3, which promotes db-test)

## Context

DB-1 (re-audit, `inferred`): SECURITY DEFINER functions are often only `REVOKE`d `FROM PUBLIC`, but
Supabase's default privileges `GRANT EXECUTE` on new functions to `anon` and `authenticated`, so a
function created without an explicit revoke is callable by roles that should not call it. A logged-out
visitor (`anon`) should never be able to invoke a privileged DEFINER function.

Two findings on investigation (observed this session):
- `supabase/tests/security_definer_exposure_test.sql` already locks a **hand-picked 13-function** set
  ("expand as the locked list grows"). That is the RH2 pattern — it proves those 13 are safe, not that
  **every** DEFINER function is. The real gap is **completeness**.
- There are **344** migration files defining SECURITY DEFINER functions. Which of them are *legitimately*
  called as authenticated RPCs (so must keep `authenticated` EXECUTE) versus internal-only needs the
  **call graph / prod `has_function_privilege`** — not determinable from the migration text alone, and I
  cannot run Supabase/pgTAP locally. A blind `REVOKE ... FROM authenticated` would risk breaking the app.

## Decision

Ship the **completeness invariant and its measurement** now; keep the actual revokes as a burndown.

- **`supabase/tests/security_definer_anon_completeness_test.sql`** — enumerates every `public` SECURITY
  DEFINER function from the catalog and asserts **none is `anon`-executable** except an explicit
  grandfather allowlist, keyed by **full identity signature** `name(argtypes)` so grandfathering one
  overload cannot mask an exposed sibling; a second assertion prunes a stale grandfather entry (gone,
  renamed, or already revoked). A diagnostic prints the exact exposed set as those same signatures, so the
  grandfather is seeded and burned down by copy-paste from CI output.
- **Scope = `anon` only.** `anon` is the defensible bright line (logged-out must not call a DEFINER
  function); false positives there are rare. The `authenticated` dimension is deliberately **not** asserted
  here — too many legitimate authenticated RPCs — and is left to the burndown with the call graph.
- **No grant is changed in this PR** — zero app-break risk (owasp lockout/accidental-deletion check: this
  only reads `has_function_privilege`, it revokes nothing).
- **`db-test` now also runs when `supabase/tests/**` changes** (a new `db_tests` change-detection filter +
  `db-test` `if`), so editing the pgTAP suite actually runs it — previously it ran only on migration
  changes, so this very test would not have been exercised on its own PR.

Seeding flow (CI is the source of truth — I cannot run pgTAP here): the grandfather ships **empty**; the
db-test run on this PR reveals the current anon-exposed set via the diagnostic; those are seeded into the
grandfather so the assertion is **green at merge** (grandfathered current exposures, catching new ones).

Design bar: prevent by construction → the pgTAP assertion is the fail-closed gate (it reds on any
anon-exposed DEFINER function outside the grandfather) → it is discriminating (an empty grandfather reds
on the real exposures; a stale entry reds assertion 2). It runs in the db-test suite, which RP-H TST-3
will promote to blocking once green.

## Alternatives considered

- **Write a `REVOKE EXECUTE ... FROM anon, authenticated` migration over the DEFINER functions.** Rejected
  — needs the call graph to avoid revoking a legitimate authenticated RPC (app-break), and `anon`/
  `authenticated` effective grants can't be confirmed without prod/a live DB. That is the Held burndown.
- **Extend the hand list in `security_definer_exposure_test.sql`.** Rejected — that perpetuates the
  incomplete pattern; a completeness enumeration is the fix.
- **A static migration-text guard.** Rejected — a function's effective grant is the state after its *last*
  `CREATE OR REPLACE` (which resets grants) plus later REVOKE/GRANTs, across 344 files; only the replayed
  schema (pgTAP) is authoritative.

## Consequences

- Any new (or existing) `public` SECURITY DEFINER function that is `anon`-executable and not grandfathered
  fails db-test — the DB-1 hole can no longer be added silently. The grandfather is the visible burndown.
- **db-test is informational and must stay so.** It is NOT in the `gate` aggregator and NOT a required
  status check (verified: `main-security-gates` requires only CodeQL, dependency-advisories, secret-scan,
  dependency-review, gate, stryker), so a red db-test does not block a PR. But db-test has no
  `continue-on-error`, so a red db-test makes the whole CI run conclude `failure` — and on `main` that
  fires `main-failure-alert` (RP-F). Therefore the grandfather must be **seeded green in this same PR**
  before merge; merging red would page. (db-test must never be added as a required check without first
  burning the suite green, or it would block every migration PR.)
- **Burndown / Held (needs the call graph or prod):** revoke `anon` (and, case by case, `authenticated`)
  EXECUTE from the grandfathered functions, removing each signature from the allowlist as it is revoked;
  add the `authenticated` completeness dimension once the legitimate-RPC set is known. Promotion of db-test
  to blocking (RP-H TST-3) requires this assertion green first.
- **Limitations (honest):** (a) scope is `anon` only — it does not cover `authenticated` (too many
  legitimate authenticated RPCs; deferred to the burndown). (b) Scope is schema `public` only; a DEFINER
  function in another anon-reachable schema would be missed (the sibling test has the same scope; app
  functions live in `public`). (c) "Shrink-only" is enforced by **review discipline**, not mechanically —
  assertion 2 prunes stale entries, but adding a new grandfather line passes CI; it is a visible diff a
  reviewer blocks (same as the sibling hand-list test and `arch-gate.waivers.json`). It is a measurement +
  invariant, not a claim the DB is already clean — the grandfather records what is not yet revoked.
