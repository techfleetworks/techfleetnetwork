# ADR 20261009 — Welcome-Flow profile data model & ownership

Status: Accepted

## Context

The Welcome Flow needs one durable fact: **"this member finished the flow"**, tracked server-side so
"never show again" holds across devices (never localStorage). It must not be confused with the
existing `profiles.onboarded_at`, which the legacy skippable wizard sets and which
`v_profile_readiness` + admin pages read — overloading it would silently change those readers and let
the skippable path mark the mandatory flow done.

Two scoping facts from the build: (1) step (d) "What do you want to do here?" and its goal toggles
were **removed from the design** (product-confirmed), so there is **no goals column**, no Preferences
sync, and no selection-driven routing; (2) step (f) "Fill out your profile" **syncs to the member's
existing profile columns** and adds none — the design's fields map to `first_name`, `last_name`,
`country`, `portfolio_url`, `linkedin_url` (all already present and allow-listed in `ProfileService`),
and the design's "State" has no existing column so it is not collected.

`profiles` is **row-scoped RLS** (`auth.uid() = user_id`), migrations **auto-apply on merge**
(ADR-0045), and `ProfileService` is the single `profiles` writer (direct supabase-js via
`retryPostgrest` + `withAuthLockRetry` — **not** `invokeEdge`).

## Decision

Add exactly **one** new column, `profiles.welcome_flow_completed_at timestamptz NULL`, owned and set
**once** by a `SECURITY DEFINER` RPC:

- `mark_welcome_flow_complete()` takes no arguments, pins to `auth.uid()`, and sets
  `welcome_flow_completed_at = COALESCE(welcome_flow_completed_at, now())` — set-once, idempotent,
  un-forgeable for another user (no client `user_id` to tamper with). Row-scoped RLS is the backstop.
- The write goes **only** through `ProfileService.markWelcomeFlowComplete`, wrapped in
  `withBoundedSave` (timeout → probe/reconcile) so a hung write on the final step surfaces as a
  bounded, retriable error instead of an infinite spinner (an S1 wrongful-lockout).
- **Expand-only, additive, idempotent** migration (`ADD COLUMN IF NOT EXISTS`, nullable forever —
  NULL = "show the flow once"); **no backfill-as-complete** (that would suppress the flow for the
  exact cohort it targets). Reads must tolerate NULL. The column is added to `ProfileService.fetch()`'s
  explicit select in a **separate later merge** from the migration (two-merge expand-first), so no
  bundle selects a column that does not yet exist.
- **Step (f) adds no column**: it reuses the existing Basic-Information columns via
  `ProfileService.updateFields`, and every field is **optional to advance** (prefilled from the
  existing profile; a value is validated, emptiness never blocks).
- **"Bidirectional sync" = one owner, one cache** (not two mirrored stores): the flow's step (f) and
  the EditProfile "Basic Information" page both write through `ProfileService` and read the one React
  Query cache.
- **The Courses completion-count stat is a live-derived read, never a stored counter.** A
  `get_welcome_flow_completion_count()` `STABLE SECURITY DEFINER` RPC returns
  `count(*) FROM profiles WHERE welcome_flow_completed_at IS NOT NULL AND NOT is_test_account` — a
  projection of the same column, computed at read time (ADR-0050 / `decisions.md` §2). No
  `welcome_flow_stats` or `+1` counter column exists; a stored counter is the forbidden two-writer
  drift class. Because completion is set-once, the count reflects distinct finishers and replays
  never inflate it.

This absorbs decision D1 (completion flag). D3/D4 (goals column + its sync) are **dropped** with
step (d).

## Alternatives considered

- **Overload `onboarded_at`.** Silently changes `v_profile_readiness` + admin, and collides with the
  legacy wizard that still writes it. Rejected.
- **localStorage / client-only completion.** Not cross-device; the brief requires "never again" on
  any device. Rejected.
- **A step-d goals column (`text[]` of stable keys).** Designed and specified, then **removed** when
  product cut step (d). Not built; returns only as a new feature with its own ADR if revived.
- **A new `state` column for the design's State field.** Out of scope — step (f) syncs to existing
  columns only; adding State is a separate profile-model change.

## Consequences

- Minimal schema: **one** nullable column + one set-once RPC + one live read RPC
  (`get_welcome_flow_completion_count()`, the Courses stat — see ADR 20261009-welcome-flow-gate
  Consequences and the requirements §6.13, live-derived per ADR-0050); no rewrite on the ~767-row
  table (PG15 metadata-only add); **rollback is a frontend bundle revert (flagless launch), never a
  migration revert** — the additive column stays harmless.
- Set-once is concurrency-safe at Read-Committed (a second writer re-reads the non-null value).
- The fetch-select change must ship **after** the migration is confirmed applied (db-schema-gate
  green) — otherwise a bundle selecting the column before it exists 400s the profile fetch and trips
  the gate error path.
- `audit_profile_changes` is extended for `portfolio_url` + `linkedin_url` (the surfaced step-f fields
  it does not already track; first/last/country are already audited).
- The flow collects **no profiling/preference data** (goals removed), which simplifies the DPIA: the
  only inputs are the optional newsletter consent and optional Basic-Information fields.