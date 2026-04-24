
-- ============================================================
-- 1) trusted_devices  — stores the public key bound to a device
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  fingerprint   text NOT NULL,                 -- sha256(spki(publicKey))  hex, 64 chars
  public_key    text NOT NULL,                 -- spki, base64
  bound_at      timestamptz NOT NULL DEFAULT now(),
  last_proof_at timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  ip_address    text,
  user_agent    text,
  CONSTRAINT trusted_devices_fingerprint_len CHECK (length(fingerprint) = 64),
  CONSTRAINT trusted_devices_pubkey_len      CHECK (length(public_key) BETWEEN 80 AND 4096),
  CONSTRAINT trusted_devices_unique_per_user UNIQUE (user_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS trusted_devices_user_idx        ON public.trusted_devices(user_id);
CREATE INDEX IF NOT EXISTS trusted_devices_user_active_idx ON public.trusted_devices(user_id, expires_at);

ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own trusted devices"
  ON public.trusted_devices FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies → only the SECURITY DEFINER RPCs below
-- (and the service role) can write. This is intentional: untrusted clients
-- must not be able to manufacture trust rows.
CREATE POLICY "Users delete their own trusted devices"
  ON public.trusted_devices FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 2) device_binding_nonces — one-time challenges to be signed
-- ============================================================
CREATE TABLE IF NOT EXISTS public.device_binding_nonces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  nonce       text NOT NULL,        -- base64(32 random bytes)  → 44 chars
  purpose     text NOT NULL,        -- 'bind' | 'proof'
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '2 minutes'),
  used_at     timestamptz,
  CONSTRAINT device_nonce_purpose_chk CHECK (purpose IN ('bind','proof')),
  CONSTRAINT device_nonce_len_chk     CHECK (length(nonce) BETWEEN 32 AND 128)
);
CREATE INDEX IF NOT EXISTS device_binding_nonces_user_idx ON public.device_binding_nonces(user_id, created_at);

ALTER TABLE public.device_binding_nonces ENABLE ROW LEVEL SECURITY;

-- No client policies — only SECURITY DEFINER functions touch this table.
-- (Rows are not owner-readable so a stolen session cookie can't enumerate
--  pending challenges.)

-- ============================================================
-- 3) Helpers — read AAL claim from current JWT
-- ============================================================
CREATE OR REPLACE FUNCTION public._current_aal()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'aal'),
    ''
  );
$$;

-- ============================================================
-- 4) issue_device_binding_nonce(purpose)
--    Returns a fresh, single-use nonce. AAL2 required for 'bind';
--    any authenticated session can request a 'proof' nonce.
-- ============================================================
CREATE OR REPLACE FUNCTION public.issue_device_binding_nonce(_purpose text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_nonce text;
  v_recent int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  IF _purpose NOT IN ('bind','proof') THEN
    RAISE EXCEPTION 'Invalid purpose' USING ERRCODE = '22023';
  END IF;
  IF _purpose = 'bind' AND public._current_aal() <> 'aal2' THEN
    RAISE EXCEPTION 'AAL2 required to bind a device' USING ERRCODE = '42501';
  END IF;

  -- Soft rate-limit: max 20 nonces per user per minute.
  SELECT count(*) INTO v_recent FROM public.device_binding_nonces
   WHERE user_id = v_uid AND created_at > now() - interval '1 minute';
  IF v_recent >= 20 THEN
    RAISE EXCEPTION 'Too many requests' USING ERRCODE = '42P09';
  END IF;

  v_nonce := encode(extensions.gen_random_bytes(32), 'base64');

  INSERT INTO public.device_binding_nonces(user_id, nonce, purpose)
  VALUES (v_uid, v_nonce, _purpose);

  RETURN v_nonce;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_device_binding_nonce(text) FROM public;
GRANT EXECUTE ON FUNCTION public.issue_device_binding_nonce(text) TO authenticated;

-- ============================================================
-- 5) consume_device_nonce — internal helper
-- ============================================================
CREATE OR REPLACE FUNCTION public._consume_device_nonce(_user_id uuid, _nonce text, _purpose text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Single-use + expiry-checked atomic consume.
  UPDATE public.device_binding_nonces
     SET used_at = now()
   WHERE user_id = _user_id
     AND nonce = _nonce
     AND purpose = _purpose
     AND used_at IS NULL
     AND expires_at > now()
   RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

-- ============================================================
-- 6) is_trusted_device_active — cheap pre-check used by client
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_trusted_device_active(_fingerprint text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trusted_devices
     WHERE user_id = auth.uid()
       AND fingerprint = _fingerprint
       AND expires_at > now()
  );
$$;

REVOKE ALL ON FUNCTION public.is_trusted_device_active(text) FROM public;
GRANT EXECUTE ON FUNCTION public.is_trusted_device_active(text) TO authenticated;

-- ============================================================
-- 7) Drop legacy stealable-token RPC + clear all existing trust
--    so every admin re-verifies once on the hardened scheme.
-- ============================================================
DROP FUNCTION IF EXISTS public.mark_device_trusted_after_mfa(text);

DELETE FROM public.passkey_login_sessions;

-- Cleanup helper now also covers the new tables.
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

  DELETE FROM public.trusted_devices WHERE expires_at < now();
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_count := v_count + v_tmp;

  DELETE FROM public.device_binding_nonces WHERE expires_at < now() - interval '1 hour';
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_count := v_count + v_tmp;

  RETURN v_count;
END;
$$;
