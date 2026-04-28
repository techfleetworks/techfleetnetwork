CREATE TABLE IF NOT EXISTS public.two_factor_login_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  session_token_hash text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, session_token_hash)
);

CREATE INDEX IF NOT EXISTS idx_two_factor_login_sessions_lookup
  ON public.two_factor_login_sessions(user_id, session_token_hash);
CREATE INDEX IF NOT EXISTS idx_two_factor_login_sessions_expires
  ON public.two_factor_login_sessions(expires_at);

ALTER TABLE public.two_factor_login_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own 2FA sessions" ON public.two_factor_login_sessions;
CREATE POLICY "Users view own 2FA sessions"
  ON public.two_factor_login_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages 2FA sessions" ON public.two_factor_login_sessions;
CREATE POLICY "Service role manages 2FA sessions"
  ON public.two_factor_login_sessions
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

INSERT INTO public.two_factor_login_sessions (user_id, session_token_hash, verified_at, expires_at, created_at)
SELECT user_id, session_token_hash, verified_at, expires_at, created_at
FROM public.passkey_login_sessions
ON CONFLICT (user_id, session_token_hash) DO UPDATE SET
  verified_at = excluded.verified_at,
  expires_at = excluded.expires_at;

CREATE OR REPLACE FUNCTION public.is_passkey_login_verified(_session_hash text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.two_factor_login_sessions
    WHERE user_id = auth.uid()
      AND session_token_hash = _session_hash
      AND expires_at > now()
  );
$function$;

CREATE OR REPLACE FUNCTION public.mark_device_trusted_after_mfa(_session_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aal text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _session_hash IS NULL OR length(_session_hash) < 32 THEN
    RAISE EXCEPTION 'Invalid session proof';
  END IF;

  v_aal := coalesce(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'aal'),
    ''
  );

  IF v_aal <> 'aal2' THEN
    RAISE EXCEPTION '2FA verification required';
  END IF;

  INSERT INTO public.two_factor_login_sessions (
    user_id,
    session_token_hash,
    verified_at,
    expires_at
  ) VALUES (
    auth.uid(),
    _session_hash,
    now(),
    now() + interval '10 minutes'
  )
  ON CONFLICT (user_id, session_token_hash) DO UPDATE SET
    verified_at = excluded.verified_at,
    expires_at = excluded.expires_at;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_passkey_login_artifacts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_tmp integer;
BEGIN
  DELETE FROM public.two_factor_login_sessions WHERE expires_at < now();
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_count := v_count + v_tmp;

  DELETE FROM public.trusted_devices WHERE expires_at < now();
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_count := v_count + v_tmp;

  DELETE FROM public.device_binding_nonces WHERE expires_at < now() - interval '1 hour';
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_count := v_count + v_tmp;

  RETURN v_count;
END;
$function$;

DROP TABLE IF EXISTS public.passkey_login_challenges CASCADE;
DROP TABLE IF EXISTS public.passkey_recovery_tokens CASCADE;
DROP TABLE IF EXISTS public.passkey_credentials CASCADE;
DROP TABLE IF EXISTS public.passkey_login_sessions CASCADE;

REVOKE ALL ON FUNCTION public.mark_device_trusted_after_mfa(text) FROM public;
REVOKE ALL ON FUNCTION public.is_passkey_login_verified(text) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_device_trusted_after_mfa(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_passkey_login_verified(text) TO authenticated;