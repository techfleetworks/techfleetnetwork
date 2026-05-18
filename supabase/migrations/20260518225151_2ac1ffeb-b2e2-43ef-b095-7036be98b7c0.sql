CREATE OR REPLACE FUNCTION public.get_roster_project_header(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_project jsonb;
  v_app_count int;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'project_type', p.project_type,
    'phase', p.phase,
    'project_status', p.project_status,
    'team_hats', p.team_hats,
    'client_id', p.client_id,
    'friendly_name', p.friendly_name,
    'description', p.description,
    'coordinator_id', p.coordinator_id,
    'client_name', c.name
  )
  INTO v_project
  FROM public.projects p
  LEFT JOIN public.clients c ON c.id = p.client_id
  WHERE p.id = p_project_id;

  IF v_project IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*)::int
  INTO v_app_count
  FROM public.project_applications
  WHERE project_id = p_project_id AND status = 'completed';

  RETURN jsonb_build_object('project', v_project, 'app_count', v_app_count);
END;
$$;

REVOKE ALL ON FUNCTION public.get_roster_project_header(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_roster_project_header(uuid) TO authenticated;