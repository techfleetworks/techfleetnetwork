
-- Hide MV from PostgREST: revoke from API roles. Expose a plain view instead.
REVOKE ALL ON public.framework_overview_mv FROM authenticated, anon;

CREATE OR REPLACE VIEW public.framework_overview_v
WITH (security_invoker = true) AS
SELECT entity_type, total, last_updated FROM public.framework_overview_mv;

GRANT SELECT ON public.framework_overview_v TO authenticated;
REVOKE ALL ON public.framework_overview_v FROM anon;

COMMENT ON VIEW public.framework_overview_v IS
  'Read-only counts per framework entity type. Backed by framework_overview_mv (refreshed by service role).';

-- Lock the refresh function: not callable by client roles.
REVOKE ALL ON FUNCTION public.refresh_framework_overview() FROM PUBLIC, authenticated, anon;
