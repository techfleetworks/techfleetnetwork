
REVOKE EXECUTE ON FUNCTION public.fw_lookup_relationships(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fw_refresh_search_mv() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fw_sync_relationships_to_kb() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_nodes_neighbors_batch(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_course_completion_counts(jsonb) FROM anon;
