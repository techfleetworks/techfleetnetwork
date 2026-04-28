-- Replace admin passkey step-up helper with authenticator-based 2FA step-up semantics.
-- The existing table/function names are kept for compatibility with generated types and existing callers,
-- but the stored proof now represents a recent TOTP verification session.

CREATE OR REPLACE FUNCTION public.is_passkey_login_verified(_session_hash text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.passkey_login_sessions
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

  INSERT INTO public.passkey_login_sessions (
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

REVOKE ALL ON FUNCTION public.mark_device_trusted_after_mfa(text) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_device_trusted_after_mfa(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_passkey_login_verified(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_2fa_grace_deadline(_user_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT MIN(created_at) + interval '5 days'
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = 'admin'::public.app_role
    ),
    now() + interval '5 days'
  );
$function$;

CREATE OR REPLACE FUNCTION public.admin_2fa_grace_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT now() < public.admin_2fa_grace_deadline(_user_id);
$function$;

REVOKE ALL ON FUNCTION public.admin_2fa_grace_deadline(uuid) FROM public;
REVOKE ALL ON FUNCTION public.admin_2fa_grace_active(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_2fa_grace_deadline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_2fa_grace_active(uuid) TO authenticated;

-- BDD coverage for the requested security behavior.
INSERT INTO public.bdd_scenarios (
  feature_area_number,
  feature_area,
  scenario_id,
  title,
  gherkin,
  status,
  test_type,
  test_file,
  notes
) VALUES
(
  80,
  'Authenticator 2FA login flow',
  '2FA-LOGIN-001',
  'Users with 2FA verify after password login before entering the app',
  'Feature: Authenticator 2FA login flow
  Scenario: 2FA-enabled member completes sign in
    Given a member has Google Authenticator 2FA enabled
    When they submit valid email and password credentials
    Then they remain on the login flow
    And they are prompted for a 6-digit authenticator code
    When they submit a valid authenticator code
    Then their session is authenticated
    And they are taken to their intended destination',
  'implemented',
  'unit',
  'src/pages/LoginPage.tsx',
  'Ensures login follows credentials then 2FA then app access.'
),
(
  80,
  'Authenticator 2FA login flow',
  '2FA-ADMIN-GRACE-001',
  'Admins get a 5-day first setup grace period before 2FA is mandatory for admin access',
  'Feature: Admin authenticator 2FA grace period
  Scenario: Admin without 2FA is inside setup grace period
    Given an admin has not enabled Google Authenticator 2FA
    And their admin 2FA grace period has not expired
    When they open the admin area
    Then they can continue working
    And they see an action to set up 2FA from profile account settings
  Scenario: Admin without 2FA is past setup grace period
    Given an admin has not enabled Google Authenticator 2FA
    And their admin 2FA grace period has expired
    When they open the admin area
    Then admin access is blocked
    And they are sent to profile account settings to enable 2FA',
  'implemented',
  'unit',
  'src/components/AdminRoute.tsx',
  'Replaces passkey enrollment requirement with a time-boxed TOTP setup requirement.'
),
(
  80,
  'Authenticator 2FA login flow',
  '2FA-PASSKEY-REMOVED-001',
  'Passkey gates and recovery are replaced by authenticator 2FA',
  'Feature: Passkey removal
  Scenario: Admin security uses authenticator 2FA only
    Given passkey functionality has been removed from the user interface
    When an admin signs in or opens admin-only actions
    Then the system uses Google Authenticator-compatible 2FA checks
    And passkey enrollment, verification, and recovery prompts are not shown',
  'implemented',
  'unit',
  'src/services/mfa.service.ts',
  'Documents passkey replacement and backend step-up association with TOTP.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();