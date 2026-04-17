
-- Track which JWT sessions have completed admin passkey verification
CREATE TABLE public.passkey_login_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_token_hash text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '8 hours'),
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, session_token_hash)
);
CREATE INDEX idx_passkey_login_sessions_lookup ON public.passkey_login_sessions(user_id, session_token_hash);
CREATE INDEX idx_passkey_login_sessions_expires ON public.passkey_login_sessions(expires_at);

ALTER TABLE public.passkey_login_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own passkey sessions"
  ON public.passkey_login_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Inserts/updates/deletes only via service role (edge functions)

-- Short-lived recovery tokens emailed to admins who can't access their passkey
CREATE TABLE public.passkey_recovery_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  used_at timestamptz,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_passkey_recovery_tokens_user ON public.passkey_recovery_tokens(user_id);
CREATE INDEX idx_passkey_recovery_tokens_lookup ON public.passkey_recovery_tokens(token_hash) WHERE used_at IS NULL;

ALTER TABLE public.passkey_recovery_tokens ENABLE ROW LEVEL SECURITY;
-- No client-side access; service-role only

-- Per-user WebAuthn assertion challenges (single row per user, replaced on each request)
CREATE TABLE public.passkey_login_challenges (
  user_id uuid PRIMARY KEY,
  challenge text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.passkey_login_challenges ENABLE ROW LEVEL SECURITY;
-- No client-side access; service-role only

-- Cleanup function for expired records (call from cron or on-demand)
CREATE OR REPLACE FUNCTION public.cleanup_passkey_login_artifacts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_tmp integer;
BEGIN
  DELETE FROM public.passkey_login_sessions WHERE expires_at < now();
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_count := v_count + v_tmp;

  DELETE FROM public.passkey_recovery_tokens WHERE expires_at < now() - interval '1 day';
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_count := v_count + v_tmp;

  DELETE FROM public.passkey_login_challenges WHERE expires_at < now();
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_count := v_count + v_tmp;

  RETURN v_count;
END;
$$;

-- Helper RPC: check if current session is verified
CREATE OR REPLACE FUNCTION public.is_passkey_login_verified(_session_hash text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.passkey_login_sessions
    WHERE user_id = auth.uid()
      AND session_token_hash = _session_hash
      AND expires_at > now()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_passkey_login_verified(text) TO authenticated;
