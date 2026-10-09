# ADR 0070 — Reconcile converges Gumroad lifecycle in both directions (clawback fix)

- Status: Accepted
- Date: 2026-09-26
- Deciders: Morgan Denner
- Epic: Membership

## Context

The Phase 0 audit of the shared Gumroad pipeline (prerequisite for class registration,
ADR-0069) found a live membership defect. The reconcile pull paths `gumroad-backfill` and
`gumroad-backfill-all` fetch refund, dispute, and subscription-ended state from the Gumroad API,
but persist sales with `ignoreDuplicates: true`. On a sale already in the ledger the whole row is
skipped, so the freshly pulled lifecycle timestamps are never written. That left the real-time
webhook as the only writer of `refunded_at` / `disputed_at` / `subscription_ended_at`. A missed or
out-of-order refund webhook therefore never removed access, and the member kept it indefinitely.
`compute_membership()` already excludes clawed-back sales correctly, so the fault was purely that
the ingestion pull path was insert-only and could never update an existing row. The drift tripwire
did not catch it because it flags profiles with no backing sale, not profiles whose sale is refunded.

## Decision

Give the pull paths a set-once, idempotent way to converge lifecycle on rows already in the ledger,
so every reconcile drives access to Gumroad's truth in both directions.

- New `public.apply_gumroad_sale_lifecycle(p_sale_id, p_refunded, p_disputed, p_cancelled_at,
p_ended_at)`, `SECURITY DEFINER`, `search_path = ''`, service role only. It updates only the
  lifecycle timestamps via `COALESCE` (set once), so it can never clear a clawback, never move an
  existing timestamp, and never touch `resolved_user_id` or `status`. Its `WHERE` clause makes a
  no-op match no row, so repeated sweeps do not re-fire the projection trigger.
- `gumroad-backfill` and `gumroad-backfill-all` call it for every clawed-back sale they pull, right
  after the insert. New sales still insert via `ignoreDuplicates`; existing rows converge lifecycle
  through the apply. The existing AFTER UPDATE projection trigger then re-derives access, which
  downgrades.
- Proven by `supabase/tests/gumroad_reconcile_clawback_test.sql`: a pulled refund for an existing
  sale downgrades the member via the trigger, a refunded sale yields no active membership on a fresh
  reproject, apply is set-once and never clears, and a member cannot call it.

## Alternatives considered

- Switch the pull upsert to update all columns on conflict. Rejected: it would clobber
  `resolved_user_id` and `status` (identity and resolution state) that the webhook and reconcile
  manage, and could un-resolve a bound sale.
- Leave the webhook as the only clawback writer. Rejected: that is the bug, a single missed event
  leaves access granted forever.
- A database-only drift sweep. Rejected as insufficient on its own: the database cannot learn about a
  new refund from Gumroad, only the pull can. The pull applying lifecycle is the missing half.

## Consequences

- This is a deliberate, tested behavior change to the membership pipeline. A refunded member who
  slipped through the webhook gap correctly loses access on the next reconcile. That is the fix, not a
  regression.
- Convergence is bounded by the reconcile interval, so it self-heals within the scheduled
  `gumroad-backfill-all` rather than never. The real-time webhook still provides the fast path.
- Set-once means no churn: repeated sweeps are no-ops on already-clawed-back sales.
- A won dispute does not restore access here, matching the existing webhook semantics
  (`classifyLifecycle` treats a won dispute as not-a-downgrade but also never clears a prior
  `disputed_at`). Restoring on a won dispute is a separate, later change if wanted.
- The migration is additive and hand-applied to prod; the schema gate stays red until applied
  (ADR-0036). The fix hardens the shared pipeline that class registration will reuse (ADR-0069), so
  both domains inherit correct clawback.
