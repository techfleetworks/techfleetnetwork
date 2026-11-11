# ADR 20261110 — DB-1 burndown batch 1: revoke anon EXECUTE on trigger functions

- Status: accepted
- Date: 2026-11-10
- Deciders: repo owner (mdenner), in session
- Relates to: ADR 20261110-db1-anon-definer-completeness (the gate + the 76-function inventory), the
  owner's scope calls this session (auth/rate-limit bucket → auth agent; stats/KPI out of scope;
  borderline account bucket in scope)

## Context

The DB-1 completeness gate recorded **76** `public` SECURITY DEFINER functions that `anon` can EXECUTE by
default. The revoke burndown is prod-sensitive: for a function `anon` has via the Postgres `PUBLIC` default,
a naive `REVOKE … FROM anon` is a no-op, and `REVOKE … FROM PUBLIC` also removes `authenticated` — which
would break a legitimate authenticated RPC. So a blind sweep is unsafe; each function needs to be classified
by who actually calls it.

Of the 76, **18 are TRIGGER functions** (`RETURNS trigger`, confirmed by reading each definition on
`origin/main`). A trigger function is invoked by the trigger mechanism as the table owner and is **not
exposed as a PostgREST RPC**, so **no role needs direct EXECUTE on it** — revoking from `PUBLIC` cannot
break a logged-in user, an edge function, or the trigger firing. That makes the 18 the unambiguously-safe
first batch.

Evidence: `observed` — each of the 18 is `RETURNS trigger` (git grep of its latest definition); the repo
already uses `REVOKE EXECUTE ON FUNCTION … FROM …` as an established pattern (e.g. `check_rate_limit`).

## Decision

Revoke EXECUTE `FROM anon, PUBLIC` on the 18 trigger functions (migration `20261110210000`), and remove
their signatures from the completeness-test grandfather (76 → 58). The `db-test` run **proves** on CI that
each is no longer `anon`-exposed: the grandfather shrank and the completeness assertion must stay green — if
any revoke were ineffective, the assertion would red (a built-in check that the revoke actually landed).

**Why `FROM anon, PUBLIC`, not `FROM PUBLIC` alone:** in this Supabase project `anon` holds a **direct role
grant** on functions (the stack's default privilege), not merely access via `PUBLIC`. Evidence (`observed`):
`trg_gumroad_sales_purchase_email` and `trg_email_alias_resolve_pending` already carry `REVOKE ALL … FROM
PUBLIC` in their only creating migrations (no later redefine, no blanket re-grant in migration history), yet
the db-test run still listed both as anon-exposed — so the exposure is a direct `anon` grant that `FROM
PUBLIC` cannot touch. This also matches the repo's existing precedent (`REVOKE EXECUTE … FROM anon`, e.g.
`check_rate_limit`). `FROM anon` removes the direct grant; `, PUBLIC` also clears any PUBLIC path; this is
safe for trigger functions (no role needs direct EXECUTE) and leaves `authenticated` untouched. This
correction came from the fresh-context review's F1 finding, investigated to root cause.

Explicitly **excluded** from this batch:
- **Auth / sign-in / rate-limit** functions — owned by the auth refactor (owner's call).
- **Stats/KPI** functions — out of scope (owner's call).
- **Intentional public RPCs** — `get_feature_flags`, `get_i18n_bundle`, `get_network_stats`,
  member-distribution stats, policy reads — `anon` legitimately calls these; they stay granted.
- **rpc-callable admin mutations** (class-admin, gumroad, `record_event`, …) — these need per-caller role
  analysis (`REVOKE FROM PUBLIC` + re-`GRANT` to `authenticated`/`service_role` as each needs), a reviewed
  **batch 2**. `record_event` (14 call sites) especially needs its anon-call paths checked first.

## Alternatives considered

- **Revoke all 76 at once.** Rejected — unsafe; the rpc-callable ones can break `authenticated` or an edge
  path without per-caller analysis.
- **`REVOKE FROM PUBLIC` alone.** Rejected — `anon` holds a direct role grant here (see Decision), so
  `FROM PUBLIC` is a no-op for it; `FROM anon, PUBLIC` is required.

## Consequences

- 18 trigger functions no longer anon-executable; the DB-1 backlog drops 76 → 58, tracked by the gate.
- **Prod impact:** applied by the migration pipeline on merge. Caller-safe (trigger functions need no
  EXECUTE grant); reversible by re-`GRANT`; idempotent (re-revoke is a no-op). Safe for expand/contract
  (ADR-0026) — nothing calls these directly, so nothing breaks mid-deploy.
- **Limitation (honest):** I could not run pgTAP/Supabase locally — effectiveness is proven by the CI
  `db-test` run (grandfather shrank + assertion green), not a local run. The `RETURNS trigger` → "no direct
  caller" inference is `observed` from each definition; a function that is *both* a trigger and invoked
  directly would be an exception, but a `RETURNS trigger` function cannot be called as a PostgREST RPC, so
  this holds. The bare `REVOKE` has no `IF EXISTS` guard (Postgres offers none for the function target), so
  a missing/renamed function would fail the deploy — accepted as **fail-fast** (a drift that removed one of
  these should stop the deploy, not pass silently), which suits a security migration. Batch 2 (the
  rpc-callable set) is deferred and needs per-caller role analysis (`REVOKE FROM anon` + re-`GRANT` to the
  roles each legitimately needs).
