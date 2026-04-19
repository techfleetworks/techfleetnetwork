-- 1. Clear Lucy's stale rate-limit rows so signup is unblocked right now.
DELETE FROM public.rate_limits
WHERE identifier = 'c365df7ed87899770327053986664d4729bfee23316855c9aa399b29135429f9';

-- 2. Add a reusable helper so admins can self-serve unblocks in one call.
--    Pepper must match the browser-side hash in src/services/rate-limit.service.ts.
CREATE OR REPLACE FUNCTION public.clear_rate_limits_for_email(p_email text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text;
  v_deleted integer;
BEGIN
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN 0;
  END IF;

  -- Mirror the client-side SHA-256 with the fixed pepper.
  v_hash := encode(extensions.digest(lower(trim(p_email)) || '::tfn-rate-limit-v1', 'sha256'), 'hex');

  DELETE FROM public.rate_limits WHERE identifier = v_hash;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Audit so we have a paper trail of admin overrides.
  INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
  VALUES ('rate_limit_cleared', 'rate_limits', v_hash, auth.uid(), ARRAY[lower(trim(p_email)), v_deleted::text]);

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_rate_limits_for_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_rate_limits_for_email(text) TO service_role;

-- 3. Allow the existing auto-remediation runner to call cleanup_rate_limits if needed.
--    (cleanup_rate_limits is already in the allowlist; this is a no-op if it already exists.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_remediation_allowed') THEN
    -- The function is IMMUTABLE so we only need to ensure the new helper is allowed if/when called.
    -- We rely on the pre-existing allowlist; no action needed here.
    NULL;
  END IF;
END $$;