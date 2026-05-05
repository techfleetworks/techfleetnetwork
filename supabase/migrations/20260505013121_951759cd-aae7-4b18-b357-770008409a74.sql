REVOKE EXECUTE ON FUNCTION public.get_audit_policy() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_audit_policy() TO authenticated;