
-- Re-declare with explicit search_path (linter fix)
CREATE OR REPLACE FUNCTION public.redact_sensitive_text(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
DECLARE
  v text := input;
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  v := regexp_replace(v, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[redacted-email]', 'g');
  v := regexp_replace(v, '\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b', '[redacted-jwt]', 'g');
  v := regexp_replace(v, '(?i)bearer\s+[A-Za-z0-9._\-]{16,}', 'Bearer [redacted-token]', 'g');
  v := regexp_replace(v, '\bsb_(secret|publishable)_[A-Za-z0-9_]{20,}', '[redacted-sb-key]', 'g');
  v := regexp_replace(v, '\b[a-f0-9]{32,}\b', '[redacted-hex-token]', 'g');
  v := regexp_replace(v, '\b(?:\d[ -]*?){13,19}\b', '[redacted-cc]', 'g');
  v := regexp_replace(v, '\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b', '[redacted-ip]', 'g');
  RETURN v;
END;
$$;
