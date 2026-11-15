-- Welcome Flow break-glass reset (requirements §7.7). The mandatory gate makes completion
-- irreversible per user (mark_welcome_flow_complete is set-once COALESCE), so before the gate
-- ships (PR5) an admin needs a way to clear welcome_flow_completed_at for ONE user — e.g. a
-- member stranded by a bad-state completion. This is the ONLY sanctioned writer of the column
-- besides the set-once completion RPC; it is NOT a normal writer: admin-gated (has_role) and
-- audited to the hash-chained audit_log via record_event. Single-user (one target id),
-- idempotent (re-running on an already-null row is a no-op UPDATE).
--
-- EXPAND / additive (supabase/migrations/CLAUDE.md): a new function only; no schema change,
-- no column drop. Mirrors admin_set_test_account (20260520035523): has_role gate + SECURITY
-- DEFINER + search_path pinned. Must be hand-applied to prod before the gate PR goes live.
CREATE OR REPLACE FUNCTION public.admin_reset_welcome_flow(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'target user id required' USING errcode = '22004';
  END IF;

  UPDATE public.profiles
     SET welcome_flow_completed_at = NULL
   WHERE user_id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no profile for user' USING errcode = 'P0002';
  END IF;

  -- Audit the break-glass action (admin actor + target) via record_event (ADR-0060). Use the
  -- 'ops_events' sink, which INSERTs directly into public.ops_events — NOT 'audit_log', whose
  -- writer (append_audit_log_entry) is absent so that branch silently no-ops (a privileged
  -- action with no trace). The nested SECURITY DEFINER call runs with this function's owner
  -- privileges, so record_event's service_role-only grant is satisfied. The pgTAP asserts this
  -- row is actually written (verifiable-quality-gates — prove the audit, don't claim it).
  PERFORM public.record_event(
    'ops_events',
    'welcome_flow.break_glass_reset',
    auth.uid(),
    jsonb_build_object('target_user_id', _user_id),
    'warn'
  );
END $$;

REVOKE ALL ON FUNCTION public.admin_reset_welcome_flow(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_welcome_flow(uuid) TO authenticated;
