-- Cohort delete (ADR-0067): give the class owner (teacher) a way to delete their OWN cohorts, and
-- admins to delete ANY cohort, through one safe, audited path — the standalone Cohorts management
-- surface in Class Admin.
--
-- Why an RPC and not a table DELETE policy:
--   * Today only admins can delete a cohort (RLS "Admins can delete cohorts"); teachers cannot. We
--     need owner-delete WITHOUT widening the table DELETE policy, and RLS can't express the safety
--     rule below (it can't count child rows or fall back to a soft-cancel). So this mirrors the
--     existing cohort mutation RPCs (cancel_cohort, submit_class_for_review,
--     set_cohort_registration_status, 20260926120000): SECURITY DEFINER, owner-or-admin, audited.
--
-- Safety (never silently drop people who registered):
--   * cohort_registrations references cohorts ON DELETE CASCADE (20260502160222), so a hard DELETE of
--     a cohort that has registrations would erase that history. So a cohort that HAS registrations, or
--     is PUBLISHED (live to learners), is SOFT-deleted: status -> 'cancelled', rows preserved. Only an
--     empty, unpublished cohort is hard-deleted. Both write a class_audit row.
--
-- 2FA posture (mirrors the app): admins act with fresh 2FA. A caller acting as admin must be at aal2
--   (public._current_aal(), 20260424164707) — the same backstop the destructive admin edge functions
--   use. A non-admin owner (teacher) is NOT required to be aal2, because teacher 2FA is optional.
--
-- Expand-only (ADR-0026): a new SECURITY DEFINER function; no column/constraint change. Idempotent via
-- CREATE OR REPLACE. Safe to apply before the UI ships and safe to leave applied if it rolls back.

CREATE OR REPLACE FUNCTION public.delete_cohort(p_cohort_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_class uuid;
  v_status text;
  v_reg_count integer;
  v_is_admin boolean;
BEGIN
  SELECT c.owner_user_id, co.class_id, co.status::text
    INTO v_owner, v_class, v_status
    FROM public.cohorts co
    JOIN public.classes c ON c.id = co.class_id
   WHERE co.id = p_cohort_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'cohort not found';
  END IF;

  v_is_admin := public.has_role(auth.uid(), 'admin');

  IF NOT (v_owner = auth.uid() OR v_is_admin) THEN
    RAISE EXCEPTION 'not authorized to delete this cohort';
  END IF;

  -- Admins act with fresh 2FA (aal2). Teachers (non-admin owners) are exempt — 2FA is optional for them.
  IF v_is_admin AND public._current_aal() <> 'aal2' THEN
    RAISE EXCEPTION 'Fresh 2FA verification required' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_reg_count
    FROM public.cohort_registrations
   WHERE cohort_id = p_cohort_id;

  -- Soft path: preserve registration history / don't yank a live cohort.
  IF v_reg_count > 0 OR v_status = 'published' THEN
    UPDATE public.cohorts
       SET status = 'cancelled',
           updated_at = now()
     WHERE id = p_cohort_id;

    INSERT INTO public.class_audit(
      entity_type, entity_id, class_id, actor_user_id, action, from_status, to_status, reason
    ) VALUES (
      'cohort', p_cohort_id, v_class, auth.uid(), 'delete_cohort', v_status, 'cancelled',
      'soft delete — ' || v_reg_count || ' registration(s) preserved'
    );
    RETURN 'cancelled';
  END IF;

  -- Hard path: empty, unpublished cohort. Record the audit before the row is gone.
  INSERT INTO public.class_audit(
    entity_type, entity_id, class_id, actor_user_id, action, from_status, to_status, reason
  ) VALUES (
    'cohort', p_cohort_id, v_class, auth.uid(), 'delete_cohort', v_status, NULL,
    'hard delete — no registrations'
  );

  DELETE FROM public.cohorts WHERE id = p_cohort_id;

  RETURN 'deleted';
END$$;

-- Signed-in users only; the owner-or-admin (+ admin aal2) check inside is the gate. Never anon.
REVOKE ALL ON FUNCTION public.delete_cohort(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_cohort(uuid) TO authenticated;
