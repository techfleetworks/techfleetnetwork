-- Decouple cohorts from the class review flow, and guard submit_class_for_review (ADR 20261126).
--
-- Root cause of the "Submit bugs out" report: submit_class_for_review did an UNCONDITIONAL
-- UPDATE classes SET status='pending_review'. On an already-PUBLISHED class the classes transition
-- trigger rejects published->pending_review, so the cohort "Submit" button threw. Two fixes here:
--   1. Refuse any class not in 'draft' (check_violation) — the RPC can never again attempt an illegal
--      transition on a live class, from ANY caller (not just because the UI hid the button).
--   2. Stop moving cohorts into review. Cohorts are born published now (20261126091000); they do not
--      ride the class approval flow. The class-level submit (a draft class's first approval) is the
--      only legitimate use and is preserved.
--
-- Expand-only: CREATE OR REPLACE, same signature. approve_and_publish_class is intentionally left
-- UNCHANGED — it still publishes any legacy pending_review cohort, so a class mid-review when this
-- applies is not stranded. Forward-only, hand-applied, idempotent.

CREATE OR REPLACE FUNCTION public.submit_class_for_review(p_class_id UUID, p_cohort_ids UUID[] DEFAULT '{}')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner UUID; v_old TEXT;
BEGIN
  SELECT owner_user_id, status::text INTO v_owner, v_old FROM public.classes WHERE id = p_class_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'class not found'; END IF;
  IF v_owner <> auth.uid() THEN RAISE EXCEPTION 'not class owner'; END IF;

  -- Only a draft class can be submitted for review. Prevents the illegal published->pending_review
  -- transition that broke the cohort Submit button on a live class.
  IF v_old <> 'draft' THEN
    RAISE EXCEPTION 'class % is not in draft (it is %); only a draft class can be submitted for review',
      p_class_id, v_old USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.classes SET status = 'pending_review', submitted_at = now() WHERE id = p_class_id;
  INSERT INTO public.class_audit(entity_type, entity_id, class_id, actor_user_id, action, from_status, to_status)
  VALUES ('class', p_class_id, p_class_id, auth.uid(), 'submit_for_review', v_old, 'pending_review');

  -- Cohorts are born published and do NOT ride the class review flow (ADR 20261126). The p_cohort_ids
  -- parameter is kept for signature compatibility with existing callers but is intentionally ignored.
END$$;
