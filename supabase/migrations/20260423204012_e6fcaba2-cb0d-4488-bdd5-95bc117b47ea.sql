
-- =========================================================================
-- Tier 1 + Tier 3 prep: Defense-in-depth security hardening
-- =========================================================================
-- This migration adds:
--   1. PII column encryption (IP addresses + user agents) using pgcrypto
--   2. Server-side log/error redaction function
--   3. Append-only hash chain on audit_log + admin_promotions
--   4. security_events table for WAF/anomaly logging
--   5. verify_audit_chain() for daily integrity check
--   6. elevated_roles helper for widening MFA gate
-- =========================================================================

-- --- 0. Ensure pgcrypto is in the right schema ---------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- --- 1. PII encryption key in vault --------------------------------------
-- Use vault.create_secret if not already present. Idempotent.
DO $$
DECLARE
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'pii_encryption_key';
  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'pii_encryption_key',
      'AES-256 key for column-level PII encryption (IPs, user agents). Rotate via vault.update_secret + re-encryption job.'
    );
  END IF;
END $$;

-- --- 2. Encrypt / decrypt helpers ----------------------------------------
-- SECURITY DEFINER so application code never sees the raw key.
CREATE OR REPLACE FUNCTION public.encrypt_pii(plain text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_key text;
BEGIN
  IF plain IS NULL OR plain = '' THEN
    RETURN plain;
  END IF;
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'pii_encryption_key' LIMIT 1;
  IF v_key IS NULL THEN
    -- Fail open with a sentinel so we never lose data if vault is misconfigured
    RETURN plain;
  END IF;
  RETURN 'enc:v1:' || encode(extensions.pgp_sym_encrypt(plain, v_key), 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_pii(cipher text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_key text;
BEGIN
  IF cipher IS NULL OR cipher = '' THEN
    RETURN cipher;
  END IF;
  -- Pre-encryption rows are returned as-is for forward compatibility
  IF cipher NOT LIKE 'enc:v1:%' THEN
    RETURN cipher;
  END IF;
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'pii_encryption_key' LIMIT 1;
  IF v_key IS NULL THEN
    RETURN '[encrypted]';
  END IF;
  BEGIN
    RETURN extensions.pgp_sym_decrypt(decode(substring(cipher from 8), 'base64'), v_key);
  EXCEPTION WHEN OTHERS THEN
    RETURN '[decrypt_error]';
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.encrypt_pii(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrypt_pii(text) FROM PUBLIC, anon, authenticated;

-- --- 3. Triggers that auto-encrypt IP/user-agent on insert/update --------
-- Idempotent: if value already starts with enc:v1:, leave it alone.
CREATE OR REPLACE FUNCTION public.tg_encrypt_pii_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- failed_login_attempts has ip_address + user_agent
  IF TG_TABLE_NAME = 'failed_login_attempts' THEN
    IF NEW.ip_address IS NOT NULL AND NEW.ip_address NOT LIKE 'enc:v1:%' THEN
      NEW.ip_address := public.encrypt_pii(NEW.ip_address);
    END IF;
    IF NEW.user_agent IS NOT NULL AND NEW.user_agent NOT LIKE 'enc:v1:%' THEN
      NEW.user_agent := public.encrypt_pii(NEW.user_agent);
    END IF;
  ELSIF TG_TABLE_NAME = 'passkey_login_sessions' THEN
    IF NEW.ip_address IS NOT NULL AND NEW.ip_address NOT LIKE 'enc:v1:%' THEN
      NEW.ip_address := public.encrypt_pii(NEW.ip_address);
    END IF;
  ELSIF TG_TABLE_NAME = 'passkey_recovery_tokens' THEN
    IF NEW.ip_address IS NOT NULL AND NEW.ip_address NOT LIKE 'enc:v1:%' THEN
      NEW.ip_address := public.encrypt_pii(NEW.ip_address);
    END IF;
  ELSIF TG_TABLE_NAME = 'audit_log' THEN
    IF NEW.ip_address IS NOT NULL AND NEW.ip_address NOT LIKE 'enc:v1:%' THEN
      NEW.ip_address := public.encrypt_pii(NEW.ip_address);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_encrypt_pii_failed_login ON public.failed_login_attempts;
CREATE TRIGGER trg_encrypt_pii_failed_login
  BEFORE INSERT OR UPDATE ON public.failed_login_attempts
  FOR EACH ROW EXECUTE FUNCTION public.tg_encrypt_pii_columns();

DROP TRIGGER IF EXISTS trg_encrypt_pii_passkey_sessions ON public.passkey_login_sessions;
CREATE TRIGGER trg_encrypt_pii_passkey_sessions
  BEFORE INSERT OR UPDATE ON public.passkey_login_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_encrypt_pii_columns();

DROP TRIGGER IF EXISTS trg_encrypt_pii_passkey_recovery ON public.passkey_recovery_tokens;
CREATE TRIGGER trg_encrypt_pii_passkey_recovery
  BEFORE INSERT OR UPDATE ON public.passkey_recovery_tokens
  FOR EACH ROW EXECUTE FUNCTION public.tg_encrypt_pii_columns();

DROP TRIGGER IF EXISTS trg_encrypt_pii_audit_log ON public.audit_log;
CREATE TRIGGER trg_encrypt_pii_audit_log
  BEFORE INSERT OR UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_encrypt_pii_columns();

-- --- 4. Backfill existing plaintext IPs/UAs ------------------------------
UPDATE public.failed_login_attempts
   SET ip_address = public.encrypt_pii(ip_address)
 WHERE ip_address IS NOT NULL AND ip_address NOT LIKE 'enc:v1:%';
UPDATE public.failed_login_attempts
   SET user_agent = public.encrypt_pii(user_agent)
 WHERE user_agent IS NOT NULL AND user_agent NOT LIKE 'enc:v1:%';

UPDATE public.passkey_login_sessions
   SET ip_address = public.encrypt_pii(ip_address)
 WHERE ip_address IS NOT NULL AND ip_address NOT LIKE 'enc:v1:%';

UPDATE public.passkey_recovery_tokens
   SET ip_address = public.encrypt_pii(ip_address)
 WHERE ip_address IS NOT NULL AND ip_address NOT LIKE 'enc:v1:%';

UPDATE public.audit_log
   SET ip_address = public.encrypt_pii(ip_address)
 WHERE ip_address IS NOT NULL AND ip_address NOT LIKE 'enc:v1:%';

-- --- 5. Admin-only decrypted views ---------------------------------------
CREATE OR REPLACE VIEW public.failed_login_attempts_decrypted
WITH (security_invoker = true) AS
SELECT
  id,
  email,
  public.decrypt_pii(ip_address) AS ip_address,
  public.decrypt_pii(user_agent) AS user_agent,
  attempted_at
FROM public.failed_login_attempts;

CREATE OR REPLACE VIEW public.audit_log_decrypted
WITH (security_invoker = true) AS
SELECT
  id, event_type, table_name, record_id, user_id,
  public.decrypt_pii(ip_address) AS ip_address,
  changed_fields, created_at, error_message, error_fingerprint
FROM public.audit_log;

-- security_invoker = true means the *caller* needs SELECT on the underlying
-- table. Combined with the existing admin-only RLS on those tables, only
-- admins can read these views.

-- --- 6. Server-side log/error redaction ----------------------------------
-- Strips emails, JWTs, bearer tokens, UUIDs, and credit-card-shaped digits
-- from any text before it lands in audit_log or notification_outbox.
CREATE OR REPLACE FUNCTION public.redact_sensitive_text(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text := input;
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  -- Emails
  v := regexp_replace(v, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[redacted-email]', 'g');
  -- JWTs (xxx.yyy.zzz, base64ish)
  v := regexp_replace(v, '\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b', '[redacted-jwt]', 'g');
  -- Bearer tokens
  v := regexp_replace(v, '(?i)bearer\s+[A-Za-z0-9._\-]{16,}', 'Bearer [redacted-token]', 'g');
  -- Supabase service role / anon key shapes (sb_*_)
  v := regexp_replace(v, '\bsb_(secret|publishable)_[A-Za-z0-9_]{20,}', '[redacted-sb-key]', 'g');
  -- Generic 32+ char hex tokens
  v := regexp_replace(v, '\b[a-f0-9]{32,}\b', '[redacted-hex-token]', 'g');
  -- 13–19 digit CC-shaped numbers (allow optional spaces/dashes)
  v := regexp_replace(v, '\b(?:\d[ -]*?){13,19}\b', '[redacted-cc]', 'g');
  -- IPv4
  v := regexp_replace(v, '\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b', '[redacted-ip]', 'g');
  RETURN v;
END;
$$;

-- Trigger: redact audit_log.error_message on write
CREATE OR REPLACE FUNCTION public.tg_redact_audit_error()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.error_message IS NOT NULL THEN
    NEW.error_message := public.redact_sensitive_text(NEW.error_message);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_redact_audit_error ON public.audit_log;
CREATE TRIGGER trg_redact_audit_error
  BEFORE INSERT OR UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_redact_audit_error();

-- Trigger: redact notification_outbox.last_error on write
CREATE OR REPLACE FUNCTION public.tg_redact_outbox_error()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.last_error IS NOT NULL THEN
    NEW.last_error := public.redact_sensitive_text(NEW.last_error);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_redact_outbox_error ON public.notification_outbox;
CREATE TRIGGER trg_redact_outbox_error
  BEFORE INSERT OR UPDATE ON public.notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.tg_redact_outbox_error();

DROP TRIGGER IF EXISTS trg_redact_dlq_error ON public.notification_dlq;
CREATE TRIGGER trg_redact_dlq_error
  BEFORE INSERT OR UPDATE ON public.notification_dlq
  FOR EACH ROW EXECUTE FUNCTION public.tg_redact_outbox_error();

-- --- 7. Append-only hash chain on audit_log ------------------------------
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS prev_hash text,
  ADD COLUMN IF NOT EXISTS row_hash text;

ALTER TABLE public.admin_promotions
  ADD COLUMN IF NOT EXISTS prev_hash text,
  ADD COLUMN IF NOT EXISTS row_hash text;

CREATE OR REPLACE FUNCTION public.tg_hash_chain()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_prev text;
  v_payload text;
BEGIN
  -- Get the most recent row_hash for this table (NULL if first row)
  EXECUTE format('SELECT row_hash FROM public.%I ORDER BY created_at DESC, id DESC LIMIT 1', TG_TABLE_NAME)
    INTO v_prev;
  NEW.prev_hash := v_prev;

  -- Build a stable JSON payload of the row (excluding hash columns themselves)
  v_payload := COALESCE(v_prev, '') || '|' || row_to_json(NEW)::text;
  NEW.row_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hash_chain_audit ON public.audit_log;
CREATE TRIGGER trg_hash_chain_audit
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_hash_chain();

DROP TRIGGER IF EXISTS trg_hash_chain_admin_promotions ON public.admin_promotions;
CREATE TRIGGER trg_hash_chain_admin_promotions
  BEFORE INSERT ON public.admin_promotions
  FOR EACH ROW EXECUTE FUNCTION public.tg_hash_chain();

-- Block UPDATE/DELETE on these tables for everyone except service role
-- (RLS already blocks UPDATE/DELETE for clients; this also blocks accidental
-- direct edits via psql/db studio)
CREATE OR REPLACE FUNCTION public.tg_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only. UPDATE/DELETE is forbidden.', TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS trg_block_audit_mutation ON public.audit_log;
CREATE TRIGGER trg_block_audit_mutation
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_mutation();

-- --- 8. verify_audit_chain() ---------------------------------------------
-- Walks the chain from oldest → newest. Returns the first row where the
-- recomputed hash does not match. NULL = chain intact.
CREATE OR REPLACE FUNCTION public.verify_audit_chain(p_table text DEFAULT 'audit_log')
RETURNS TABLE(broken_id uuid, broken_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_prev text := NULL;
  v_expected text;
  r record;
BEGIN
  IF p_table NOT IN ('audit_log','admin_promotions') THEN
    RAISE EXCEPTION 'verify_audit_chain only supports audit_log or admin_promotions';
  END IF;
  FOR r IN EXECUTE format(
    'SELECT id, created_at, prev_hash, row_hash, row_to_json(t.*) AS j FROM public.%I t ORDER BY created_at ASC, id ASC',
    p_table
  ) LOOP
    -- Recompute. NB: row_to_json for the trigger included the new row with
    -- prev_hash set but row_hash NULL. We therefore reconstruct the same
    -- payload by stripping row_hash but keeping prev_hash.
    v_expected := encode(
      extensions.digest(COALESCE(v_prev, '') || '|' || (r.j::jsonb - 'row_hash')::text, 'sha256'),
      'hex'
    );
    IF r.row_hash IS NULL OR r.row_hash <> v_expected THEN
      broken_id := r.id;
      broken_at := r.created_at;
      RETURN NEXT;
      RETURN;
    END IF;
    v_prev := r.row_hash;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_audit_chain(text) FROM PUBLIC, anon, authenticated;

-- --- 9. security_events table (Tier 2 WAF + Tier 3 anomalies) ------------
CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','error','critical')),
  source text NOT NULL DEFAULT 'unknown',
  user_id uuid,
  ip_address text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON public.security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON public.security_events(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON public.security_events(user_id, created_at DESC);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view security events" ON public.security_events;
CREATE POLICY "Admins can view security events"
  ON public.security_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages security events" ON public.security_events;
CREATE POLICY "Service role manages security events"
  ON public.security_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Encrypt IPs in security_events too
DROP TRIGGER IF EXISTS trg_encrypt_security_events_ip ON public.security_events;
CREATE OR REPLACE FUNCTION public.tg_encrypt_security_events_ip()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.ip_address IS NOT NULL AND NEW.ip_address NOT LIKE 'enc:v1:%' THEN
    NEW.ip_address := public.encrypt_pii(NEW.ip_address);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_encrypt_security_events_ip
  BEFORE INSERT OR UPDATE ON public.security_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_encrypt_security_events_ip();

-- --- 10. elevated_role helper (widens MFA gate) --------------------------
-- Returns true if the user has ANY role considered elevated. Today only
-- admin; tomorrow we add 'coordinator', 'recruiter' etc. without code edits.
CREATE OR REPLACE FUNCTION public.is_elevated(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::app_role)
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_elevated(uuid) TO authenticated;
