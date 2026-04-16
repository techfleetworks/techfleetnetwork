-- Revoked sessions: server-side list of users whose tokens should be rejected
CREATE TABLE IF NOT EXISTS public.revoked_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL DEFAULT 'manual',
  revoked_by uuid,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revoked_sessions_user_id ON public.revoked_sessions(user_id, revoked_at DESC);

ALTER TABLE public.revoked_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all revocations"
  ON public.revoked_sessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert revocations"
  ON public.revoked_sessions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages revocations"
  ON public.revoked_sessions FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view own revocations"
  ON public.revoked_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Failed login attempts (per email+ip) for suspicious-activity detection
CREATE TABLE IF NOT EXISTS public.failed_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_address text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_failed_logins_email_time ON public.failed_login_attempts(email, attempted_at DESC);

ALTER TABLE public.failed_login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view failed logins"
  ON public.failed_login_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages failed logins"
  ON public.failed_login_attempts FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Passkey credentials (WebAuthn)
CREATE TABLE IF NOT EXISTS public.passkey_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  device_name text NOT NULL DEFAULT 'Passkey',
  transports text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_passkey_user_id ON public.passkey_credentials(user_id);

ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own passkeys"
  ON public.passkey_credentials FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all passkeys"
  ON public.passkey_credentials FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins can view all passkeys"
  ON public.passkey_credentials FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Function: check if user's sessions are revoked after a token was issued
CREATE OR REPLACE FUNCTION public.is_session_revoked(_user_id uuid, _issued_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.revoked_sessions
    WHERE user_id = _user_id AND revoked_at > _issued_at
  );
$$;

-- Function: log failed login + auto-revoke if too many
CREATE OR REPLACE FUNCTION public.record_failed_login(
  _email text,
  _ip text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent_count int;
  v_user_id uuid;
  v_threshold int := 5;
  v_window interval := '15 minutes';
BEGIN
  INSERT INTO public.failed_login_attempts (email, ip_address, user_agent)
  VALUES (_email, _ip, _user_agent);

  SELECT count(*) INTO v_recent_count
  FROM public.failed_login_attempts
  WHERE email = _email AND attempted_at > now() - v_window;

  IF v_recent_count >= v_threshold THEN
    SELECT id INTO v_user_id FROM auth.users WHERE email = _email LIMIT 1;
    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.revoked_sessions (user_id, reason, ip_address)
      VALUES (v_user_id, 'auto_suspicious_activity', _ip);
      RETURN jsonb_build_object('revoked', true, 'attempts', v_recent_count);
    END IF;
  END IF;

  RETURN jsonb_build_object('revoked', false, 'attempts', v_recent_count);
END;
$$;

-- Audit trigger
CREATE OR REPLACE FUNCTION public.audit_session_revocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
  VALUES ('session_revoked', 'revoked_sessions', NEW.id::text, NEW.user_id, ARRAY[NEW.reason]);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_session_revocation ON public.revoked_sessions;
CREATE TRIGGER trg_audit_session_revocation
AFTER INSERT ON public.revoked_sessions
FOR EACH ROW EXECUTE FUNCTION public.audit_session_revocation();