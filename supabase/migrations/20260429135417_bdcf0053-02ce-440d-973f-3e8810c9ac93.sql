CREATE OR REPLACE FUNCTION public.get_dashboard_overview(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_phase_counts jsonb;
  v_general_app  jsonb;
  v_project_apps jsonb;
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT jsonb_object_agg(phase::text, cnt) INTO v_phase_counts
  FROM (
    SELECT phase, count(*) AS cnt
    FROM public.journey_progress
    WHERE user_id = p_user_id AND completed = true
    GROUP BY phase
  ) sub;

  SELECT to_jsonb(ga) INTO v_general_app
  FROM (
    SELECT id, status, completed_at, updated_at, current_section
    FROM public.general_applications
    WHERE user_id = p_user_id
    ORDER BY
      CASE WHEN status = 'completed' THEN 0 ELSE 1 END,
      completed_at DESC NULLS LAST,
      updated_at DESC
    LIMIT 1
  ) ga;

  SELECT jsonb_agg(row_to_json(t)) INTO v_project_apps
  FROM (
    SELECT id, project_id, status, applicant_status, completed_at, updated_at,
           current_step, team_hats_interest
    FROM public.project_applications
    WHERE user_id = p_user_id
    ORDER BY updated_at DESC
  ) t;

  RETURN jsonb_build_object(
    'phase_counts', COALESCE(v_phase_counts, '{}'::jsonb),
    'general_application', v_general_app,
    'project_applications', COALESCE(v_project_apps, '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dashboard_overview(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_dashboard_overview(uuid) TO authenticated;