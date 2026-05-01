-- Root cause of the user's "loop and glitch when saving as a draft":
-- React Query invalidations after a draft save re-trigger the dashboard widgets,
-- which call these RPCs. They were all SECURITY DEFINER with internal admin
-- gates, but EXECUTE had been revoked from authenticated, so every call failed
-- with permission_denied and React Query retried 3× → visible refetch storm.
--
-- All of these functions self-check `has_role(auth.uid(),'admin')` internally,
-- so granting EXECUTE to `authenticated` is safe — non-admins still get
-- "Admin access required". Anonymous role is intentionally NOT granted.
GRANT EXECUTE ON FUNCTION public.get_email_pipeline_health(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_error_fingerprints(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_auto_remediations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_system_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_overview(uuid) TO authenticated;

-- Belt-and-braces: ensure anon can NEVER execute these even if a future
-- migration accidentally grants PUBLIC.
REVOKE EXECUTE ON FUNCTION public.get_email_pipeline_health(integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_top_error_fingerprints(integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_auto_remediations() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.evaluate_system_health() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_overview(uuid) FROM anon, PUBLIC;