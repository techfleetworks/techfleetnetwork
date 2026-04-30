-- Restore EXECUTE on get_network_stats for anon + authenticated.
-- This RPC returns only aggregate counts (signups, course completions, projects)
-- and is rendered on the public landing page — must remain accessible to anonymous visitors.
GRANT EXECUTE ON FUNCTION public.get_network_stats() TO anon, authenticated;