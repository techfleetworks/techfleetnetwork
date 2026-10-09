-- Gumroad reconcile clawback fix (ADR-0070).
--
-- Root cause (data/integration layer, not the projector). The pull paths
-- gumroad-backfill and gumroad-backfill-all fetch refund, dispute, and
-- subscription-ended state from the Gumroad API, but persist sales with
-- ignoreDuplicates = true. On a sale already in the ledger the whole row is
-- skipped, so the freshly pulled lifecycle timestamps are never written. That
-- left the real-time webhook as the ONLY writer of refunded_at / disputed_at /
-- subscription_ended_at. A missed or out-of-order refund webhook therefore never
-- removed access, and the member kept it indefinitely. compute_membership already
-- excludes clawed-back sales correctly; the fault was purely that ingestion's pull
-- path was insert-only and could never update an existing row.
--
-- Fix. Add a set-once, idempotent lifecycle apply that the pull paths call for
-- every sale they pull. It only SETS timestamps (via COALESCE), so it can never
-- un-refund a sale or clobber resolved_user_id / status. The existing AFTER
-- UPDATE projection trigger then re-derives access, which downgrades. The result:
-- every reconcile run converges access to Gumroad's truth in BOTH directions, so a
-- missed webhook self-heals within the sweep instead of never. This also protects
-- membership today and is a prerequisite for the class-registration domain reusing
-- the same pipeline (ADR-0069).
--
-- The invariant this closes is proven in supabase/tests/gumroad_reconcile_clawback_test.sql:
-- a sale with refunded_at or disputed_at set yields no active membership, even
-- after a reproject, and apply is set-once (a second call is a no-op).

create or replace function public.apply_gumroad_sale_lifecycle(
  p_sale_id      text,
  p_refunded     boolean,
  p_disputed     boolean,
  p_cancelled_at timestamptz,
  p_ended_at     timestamptz
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_matched int;
begin
  -- Set-once only: COALESCE keeps any timestamp already present, so this never
  -- clears a clawback, never moves an existing timestamp, and never touches
  -- resolved_user_id or status. The WHERE clause makes a no-op change match no
  -- row, so repeated pulls do not re-fire the projection trigger.
  update public.gumroad_sales gs
     set refunded_at               = coalesce(gs.refunded_at, case when p_refunded then now() end),
         disputed_at               = coalesce(gs.disputed_at, case when p_disputed then now() end),
         subscription_cancelled_at = coalesce(gs.subscription_cancelled_at, p_cancelled_at),
         subscription_ended_at     = coalesce(gs.subscription_ended_at, p_ended_at)
   where gs.sale_id = p_sale_id
     and (
       (p_refunded            and gs.refunded_at               is null) or
       (p_disputed            and gs.disputed_at               is null) or
       (p_cancelled_at is not null and gs.subscription_cancelled_at is null) or
       (p_ended_at     is not null and gs.subscription_ended_at     is null)
     );
  get diagnostics v_matched = row_count;
  return v_matched > 0;
end$$;

comment on function public.apply_gumroad_sale_lifecycle(text, boolean, boolean, timestamptz, timestamptz) is
  'Set-once idempotent apply of Gumroad lifecycle (refund/dispute/cancel/end) to an existing gumroad_sales row, used by the reconcile pull paths so a missed webhook still downgrades access. Only sets timestamps, never clears them or touches resolution state. Service role only. ADR-0070.';

-- Least privilege: the pull paths run as service role; members and anon can never
-- call this (they cannot write the ledger at all).
revoke all on function public.apply_gumroad_sale_lifecycle(text, boolean, boolean, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_gumroad_sale_lifecycle(text, boolean, boolean, timestamptz, timestamptz) to service_role;
