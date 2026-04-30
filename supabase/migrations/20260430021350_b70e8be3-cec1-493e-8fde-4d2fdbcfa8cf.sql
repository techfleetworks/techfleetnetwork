REVOKE EXECUTE ON FUNCTION public.try_write_audit_log(text, text, text, uuid, text[], text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.your_audit_function_name() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_network_stats() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_network_stats() TO authenticated;