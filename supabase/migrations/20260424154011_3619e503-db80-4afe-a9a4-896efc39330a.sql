-- Allow the client (after a successful Supabase TOTP verification at AAL2)
-- to mark the current device as trusted for 30 days, sharing the same
-- passkey_login_sessions table as passkey verification. This unifies the
-- 30-day device-trust window across both second factors so admins are not
-- prompted again on the same device until the window expires.
--
-- Security:
--  • SECURITY DEFINER + STRICT search_path
--  • Only callable by authenticated users for their own user id
--  • Requires the caller's JWT to be at AAL2 (verified MFA challenge this
--    request) — prevents an AAL1 caller from self-marking.
--  • Hash length is validated to match sha256 hex output (64 chars).
CREATE OR REPLACE FUNCTION public.mark_device_trusted_after_mfa(_session_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_aal text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF _session_hash IS NULL OR length(_session_hash) <> 64 THEN
    RETURN false;
  END IF;

  -- Read the AAL claim from the current JWT. Only AAL2 callers may mark
  -- a device trusted via this RPC — anything weaker would let an AAL1
  -- session bypass the very challenge we are gating.
  v_aal := coalesce(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'aal'),
    ''
  );
  IF v_aal <> 'aal2' THEN
    RETURN false;
  END IF;

  INSERT INTO public.passkey_login_sessions (
    user_id, session_token_hash, verified_at, expires_at
  ) VALUES (
    v_uid, _session_hash, now(), now() + interval '30 days'
  )
  ON CONFLICT (user_id, session_token_hash) DO UPDATE
    SET verified_at = excluded.verified_at,
        expires_at  = excluded.expires_at;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_device_trusted_after_mfa(text) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_device_trusted_after_mfa(text) TO authenticated;