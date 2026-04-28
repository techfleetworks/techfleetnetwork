CREATE OR REPLACE FUNCTION public.is_two_factor_login_verified(_session_hash text)
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

CREATE OR REPLACE FUNCTION public.mark_two_factor_login_verified(_session_hash text)
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

CREATE OR REPLACE FUNCTION public.cleanup_two_factor_login_artifacts()
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

REVOKE ALL ON FUNCTION public.is_two_factor_login_verified(text) FROM public;
REVOKE ALL ON FUNCTION public.mark_two_factor_login_verified(text) FROM public;
REVOKE ALL ON FUNCTION public.cleanup_two_factor_login_artifacts() FROM public;
GRANT EXECUTE ON FUNCTION public.is_two_factor_login_verified(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_two_factor_login_verified(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_two_factor_login_artifacts() TO service_role;

DROP FUNCTION IF EXISTS public.is_passkey_login_verified(text);
DROP FUNCTION IF EXISTS public.mark_device_trusted_after_mfa(text);

UPDATE public.system_remediations
SET remediation_function = 'cleanup_two_factor_login_artifacts',
    signature_pattern = 'mfa|2fa|totp|authenticator|aal2',
    description = 'Purge stale 2FA login artifacts',
    updated_at = now()
WHERE remediation_function = 'cleanup_passkey_login_artifacts';

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
) VALUES
(
  'AUTH-2FA-LOGIN-GATE-002',
  'Authentication security',
  17,
  'Enrolled users must verify 2FA immediately after login',
  'Feature: Authenticator 2FA login\n  Scenario: User with verified authenticator factor signs in\n    Given a user has a verified Google Authenticator-compatible 2FA factor\n    When the user successfully enters their email and password\n    Then the app prompts for the 6-digit authenticator code before protected content is usable\n    And cancelling the prompt signs the user out',
  'implemented',
  'unit',
  'src/test/ui/MfaEnforcementGuard.test.tsx',
  'Regression coverage for the standard Login -> 2FA -> authenticated flow.'
),
(
  'AUTH-PASSKEY-REMOVED-002',
  'Authentication security',
  17,
  'Passkey functionality is removed from active code paths',
  'Feature: Passkey removal\n  Scenario: Authentication uses authenticator 2FA only\n    Given passkey functionality has been retired\n    When a user signs in or manages account security\n    Then passkey registration, verification, and recovery flows are not available\n    And 2FA uses Google Authenticator-compatible TOTP instead',
  'implemented',
  'unit',
  'src/test/ui/MfaEnforcementGuard.test.tsx; src/test/lib/client-request-throttle.test.ts',
  'Documents the passkey replacement with authenticator 2FA.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();