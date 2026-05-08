CREATE OR REPLACE FUNCTION public.approve_and_publish_class(p_class_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_old TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT status::text INTO v_old FROM public.classes WHERE id = p_class_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'class not found'; END IF;
  IF v_old <> 'pending_review' THEN
    RAISE EXCEPTION 'Class is no longer pending review (current status: %).', v_old;
  END IF;

  UPDATE public.classes SET status = 'published', published_at = now() WHERE id = p_class_id;
  INSERT INTO public.class_audit(entity_type, entity_id, class_id, actor_user_id, action, from_status, to_status)
  VALUES ('class', p_class_id, p_class_id, auth.uid(), 'publish', v_old, 'published');

  UPDATE public.cohorts SET status = 'published', published_at = now()
    WHERE class_id = p_class_id AND status = 'pending_review';
END
$$;

CREATE OR REPLACE FUNCTION public.request_class_changes(p_class_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_old TEXT; v_len INT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only'; END IF;
  v_len := length(coalesce(trim(p_reason), ''));
  IF v_len < 20 OR v_len > 2000 THEN
    RAISE EXCEPTION 'Reason must be between 20 and 2000 characters (got %).', v_len;
  END IF;
  SELECT status::text INTO v_old FROM public.classes WHERE id = p_class_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'class not found'; END IF;
  IF v_old <> 'pending_review' THEN
    RAISE EXCEPTION 'Class is not pending review (current status: %).', v_old;
  END IF;

  UPDATE public.classes SET status = 'draft' WHERE id = p_class_id;
  INSERT INTO public.class_audit(entity_type, entity_id, class_id, actor_user_id, action, from_status, to_status, reason)
  VALUES ('class', p_class_id, p_class_id, auth.uid(), 'request_changes', v_old, 'draft', p_reason);
END
$$;

CREATE OR REPLACE FUNCTION public.submit_class_for_review(p_class_id uuid, p_cohort_ids uuid[] DEFAULT '{}'::uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old TEXT;
  v_owner uuid;
  v_title text;
  v_summary text;
  v_track text;
  v_outcomes text;
BEGIN
  SELECT status::text, owner_user_id, title, summary, track::text, outcomes
    INTO v_old, v_owner, v_title, v_summary, v_track, v_outcomes
    FROM public.classes WHERE id = p_class_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'class not found'; END IF;
  IF v_owner <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF v_old <> 'draft' THEN
    RAISE EXCEPTION 'Only draft classes can be submitted (current status: %).', v_old;
  END IF;
  IF coalesce(trim(v_title), '') = ''
     OR coalesce(trim(v_summary), '') = ''
     OR coalesce(trim(v_track), '') = ''
     OR coalesce(trim(v_outcomes), '') = '' THEN
    RAISE EXCEPTION 'Class is missing required fields (title, summary, track, outcomes).';
  END IF;

  UPDATE public.classes SET status = 'pending_review', submitted_at = now() WHERE id = p_class_id;
  INSERT INTO public.class_audit(entity_type, entity_id, class_id, actor_user_id, action, from_status, to_status)
  VALUES ('class', p_class_id, p_class_id, auth.uid(), 'submit', v_old, 'pending_review');

  IF array_length(p_cohort_ids, 1) IS NOT NULL THEN
    UPDATE public.cohorts SET status = 'pending_review', submitted_at = now()
      WHERE class_id = p_class_id AND id = ANY(p_cohort_ids) AND status = 'draft';
  END IF;
END
$$;