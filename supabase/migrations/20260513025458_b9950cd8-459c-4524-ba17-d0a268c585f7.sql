-- Revoke sensitive operational project columns from broad roles.
-- These leak via the "Authenticated users can view non-complete projects" RLS policy.
-- After revoke, PostgREST's `select=*` silently excludes them for anon/authenticated.
-- Admin/member access flows through SECURITY DEFINER RPCs below.

REVOKE SELECT (discord_role_id, discord_role_name, notion_repository_url, client_intake_url)
  ON public.projects FROM anon, authenticated;

-- Member/admin-gated RPC: returns operational links for users on the project's roster
-- or admins. Used by MyProjectsTab and ProjectFormPage prefill.
CREATE OR REPLACE FUNCTION public.get_project_internal_links(p_project_id uuid)
RETURNS TABLE (
  discord_role_id text,
  discord_role_name text,
  notion_repository_url text,
  client_intake_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.project_roster pr
      WHERE pr.project_id = p_project_id AND pr.user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized for project %', p_project_id USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT p.discord_role_id, p.discord_role_name,
           p.notion_repository_url, p.client_intake_url
    FROM public.projects p
    WHERE p.id = p_project_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_project_internal_links(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_internal_links(uuid) TO authenticated;