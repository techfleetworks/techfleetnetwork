-- OWASP A01/A03/A05 hardening: public pre-auth helpers must have strict input allowlists and bounds.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier text,
  p_action text,
  p_max_attempts integer DEFAULT 5,
  p_window_minutes integer DEFAULT 1,
  p_block_minutes integer DEFAULT 5
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_record record;
  v_now timestamptz := now();
  v_lock_key bigint;
  v_identifier text := lower(trim(coalesce(p_identifier, '')));
  v_action text := lower(trim(coalesce(p_action, '')));
BEGIN
  IF v_identifier !~ '^[a-f0-9]{64}$' THEN
    RETURN json_build_object('allowed', false, 'remaining', 0, 'retry_after', 60);
  END IF;

  IF v_action NOT IN ('login_attempt', 'signup_attempt', 'password_reset') THEN
    RETURN json_build_object('allowed', false, 'remaining', 0, 'retry_after', 60);
  END IF;

  p_max_attempts := CASE
    WHEN v_action = 'login_attempt' THEN least(greatest(coalesce(p_max_attempts, 6), 1), 10)
    ELSE least(greatest(coalesce(p_max_attempts, 3), 1), 5)
  END;
  p_window_minutes := least(greatest(coalesce(p_window_minutes, 15), 1), 60);
  p_block_minutes := least(greatest(coalesce(p_block_minutes, 60), 1), 1440);

  v_lock_key := hashtextextended(v_identifier || ':' || v_action, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT * INTO v_record
  FROM public.rate_limits
  WHERE identifier = v_identifier AND action = v_action
  ORDER BY window_start DESC
  LIMIT 1
  FOR UPDATE;

  IF v_record IS NOT NULL AND v_record.blocked_until IS NOT NULL THEN
    IF v_record.blocked_until > v_now THEN
      RETURN json_build_object(
        'allowed', false,
        'remaining', 0,
        'retry_after', extract(epoch from (v_record.blocked_until - v_now))::int
      );
    ELSE
      DELETE FROM public.rate_limits WHERE id = v_record.id;
      v_record := NULL;
    END IF;
  END IF;

  IF v_record IS NOT NULL AND v_record.window_start < v_now - (p_window_minutes || ' minutes')::interval THEN
    DELETE FROM public.rate_limits WHERE id = v_record.id;
    v_record := NULL;
  END IF;

  IF v_record IS NULL THEN
    INSERT INTO public.rate_limits (identifier, action, attempt_count, window_start)
    VALUES (v_identifier, v_action, 1, v_now);
    RETURN json_build_object('allowed', true, 'remaining', p_max_attempts - 1, 'retry_after', 0);
  END IF;

  UPDATE public.rate_limits
  SET attempt_count = v_record.attempt_count + 1,
      blocked_until = CASE
        WHEN v_record.attempt_count + 1 > p_max_attempts
        THEN v_now + (p_block_minutes || ' minutes')::interval
        ELSE NULL
      END
  WHERE id = v_record.id;

  IF v_record.attempt_count + 1 > p_max_attempts THEN
    RETURN json_build_object('allowed', false, 'remaining', 0, 'retry_after', p_block_minutes * 60);
  END IF;

  RETURN json_build_object(
    'allowed', true,
    'remaining', greatest(0, p_max_attempts - (v_record.attempt_count + 1)),
    'retry_after', 0
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_failed_login(
  _email text,
  _ip text DEFAULT NULL::text,
  _user_agent text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_recent_count int;
  v_user_id uuid;
  v_threshold int := 5;
  v_window interval := '15 minutes';
  v_email text := lower(trim(coalesce(_email, '')));
  v_ip text := left(coalesce(_ip, ''), 64);
  v_user_agent text := left(coalesce(_user_agent, ''), 200);
BEGIN
  IF v_email !~ '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$' OR length(v_email) > 254 THEN
    RETURN jsonb_build_object('revoked', false, 'attempts', 0);
  END IF;

  IF v_ip <> '' AND v_ip !~ '^[A-Fa-f0-9:.]{3,64}$' THEN
    v_ip := '';
  END IF;

  INSERT INTO public.failed_login_attempts (email, ip_address, user_agent)
  VALUES (v_email, NULLIF(v_ip, ''), public.redact_sensitive_text(v_user_agent));

  SELECT count(*) INTO v_recent_count
  FROM public.failed_login_attempts
  WHERE email = v_email AND attempted_at > now() - v_window;

  IF v_recent_count >= v_threshold THEN
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email LIMIT 1;
    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.revoked_sessions (user_id, reason, ip_address)
      VALUES (v_user_id, 'auto_suspicious_activity', NULLIF(v_ip, ''));
      RETURN jsonb_build_object('revoked', true, 'attempts', v_recent_count);
    END IF;
  END IF;

  RETURN jsonb_build_object('revoked', false, 'attempts', v_recent_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_invitation(p_token text)
RETURNS TABLE(email text, expires_at timestamp with time zone, used_at timestamp with time zone)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token text := trim(coalesce(p_token, ''));
BEGIN
  IF v_token !~ '^[A-Za-z0-9_-]{32,128}$' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT i.email, i.expires_at, i.used_at
  FROM public.invitations i
  WHERE i.token = v_token
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.use_invitation(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token text := trim(coalesce(p_token, ''));
BEGIN
  IF v_token !~ '^[A-Za-z0-9_-]{32,128}$' THEN
    RETURN false;
  END IF;

  UPDATE public.invitations
  SET used_at = now()
  WHERE token = v_token
    AND used_at IS NULL
    AND expires_at > now();
  
  RETURN FOUND;
END;
$function$;

INSERT INTO public.bdd_scenarios (
  scenario_id,
  feature_area,
  feature_area_number,
  title,
  gherkin,
  status,
  test_type,
  test_file,
  notes
) VALUES (
  'SEC-PREAUTH-VALIDATION-009',
  'Security hardening',
  90,
  'Public pre-authentication helpers enforce strict input validation',
  'Feature: Public pre-authentication helper validation\n  Scenario: Anonymous visitors call login throttling or invitation helpers\n    Given selected helpers must remain available before sign-in\n    When an anonymous visitor submits malformed identifiers, unsupported actions, invalid email values, or non-token invitation values\n    Then the helper rejects or no-ops the request without exposing privileged data\n    And valid login throttling and invitation signup flows continue to work',
  'implemented',
  'manual',
  'supabase/migrations/current_preauth_helper_validation.sql',
  'OWASP A01/A03/A05 guard for intentionally public SECURITY DEFINER helpers.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();