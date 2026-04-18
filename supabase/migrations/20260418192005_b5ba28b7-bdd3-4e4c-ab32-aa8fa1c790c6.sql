-- Restore anon execute on check_rate_limit. The previous broad REVOKE
-- accidentally broke login, signup, and password reset flows because the
-- client now calls this RPC directly via PostgREST before the user is
-- authenticated. The function is SECURITY DEFINER and only writes to
-- public.rate_limits using the hashed identifier supplied by the caller,
-- which is the intended, safe behaviour.
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int, int) TO anon, authenticated;