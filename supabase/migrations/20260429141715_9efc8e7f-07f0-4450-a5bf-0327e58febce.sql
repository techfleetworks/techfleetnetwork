-- OWASP A01/A03/A05 hardening: internal MFA/device helpers are backend-only unless actively used by the client.

CREATE OR REPLACE FUNCTION public.mark_two_factor_login_verified(_session_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aal text;
  v_session_hash text := lower(trim(coalesce(_session_hash, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_session_hash !~ '^[a-f0-9]{64}$' THEN
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
    v_session_hash,
    now(),
    now() + interval '10 minutes'
  )
  ON CONFLICT (user_id, session_token_hash) DO UPDATE SET
    verified_at = excluded.verified_at,
    expires_at = excluded.expires_at;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_two_factor_login_verified(_session_hash text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session_hash text := lower(trim(coalesce(_session_hash, '')));
BEGIN
  IF auth.uid() IS NULL OR v_session_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.two_factor_login_sessions
    WHERE user_id = auth.uid()
      AND session_token_hash = v_session_hash
      AND expires_at > now()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_trusted_device_active(_fingerprint text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fingerprint text := lower(trim(coalesce(_fingerprint, '')));
BEGIN
  IF auth.uid() IS NULL OR v_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.trusted_devices
     WHERE user_id = auth.uid()
       AND fingerprint = v_fingerprint
       AND expires_at > now()
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._consume_device_nonce(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._current_aal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.issue_device_binding_nonce(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_trusted_device_active(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_two_factor_login_verified(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_two_factor_login_verified(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public._consume_device_nonce(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public._current_aal() TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_device_binding_nonce(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_trusted_device_active(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_two_factor_login_verified(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_two_factor_login_verified(text) TO authenticated, service_role;

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
  'SEC-MFA-RPC-LEAST-PRIVILEGE-011',
  'Security hardening',
  90,
  'MFA helper RPCs are least-privilege and proof-bound',
  'Feature: MFA helper least privilege\n  Scenario: A signed-in user attempts to call internal MFA and trusted-device helpers directly\n    Given only the MFA verification marker is required by the client after AAL2\n    When a user calls retired or internal nonce, trusted-device, or session-check helpers directly\n    Then the database denies direct execution\n    And the remaining MFA verification marker accepts only a bounded SHA-256 session proof after AAL2',
  'implemented',
  'manual',
  'supabase/migrations/current_mfa_rpc_least_privilege.sql',
  'OWASP A01/A03/A05 guard for elevated MFA helpers and session-proof validation.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();