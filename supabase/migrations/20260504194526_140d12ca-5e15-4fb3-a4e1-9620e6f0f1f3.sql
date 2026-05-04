CREATE OR REPLACE FUNCTION public.fleety_record_action(
  p_turn_id UUID,
  p_action_type TEXT,
  p_action_label TEXT DEFAULT NULL,
  p_target_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_action_type NOT IN ('chip_click','link_open','step_done','copy','discord_post','example_view','playbook_open','followup_click') THEN
    RAISE EXCEPTION 'invalid action_type';
  END IF;

  INSERT INTO public.fleety_action_events(turn_id, user_id, action_type, action_label, target_url)
  VALUES (p_turn_id, v_user_id, p_action_type, left(coalesce(p_action_label,''), 200), left(coalesce(p_target_url,''), 500))
  RETURNING id INTO v_id;

  IF p_turn_id IS NOT NULL AND p_action_type IN ('chip_click','link_open','playbook_open','example_view','followup_click') THEN
    UPDATE public.fleety_turn_signals
       SET chips_clicked = chips_clicked + 1
     WHERE id = p_turn_id;
  END IF;

  RETURN v_id;
END;
$$;