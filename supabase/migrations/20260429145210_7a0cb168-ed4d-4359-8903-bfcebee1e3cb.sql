ALTER VIEW public.project_roster_member_view SET (security_invoker = true);
REVOKE ALL ON public.project_roster_member_view FROM PUBLIC, anon;
GRANT SELECT ON public.project_roster_member_view TO authenticated;