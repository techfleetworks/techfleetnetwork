CREATE UNIQUE INDEX IF NOT EXISTS idx_passkey_login_sessions_user_session_hash
ON public.passkey_login_sessions (user_id, session_token_hash);

INSERT INTO public.bdd_scenarios (
  scenario_id,
  feature_area_number,
  feature_area,
  title,
  gherkin,
  status,
  test_type,
  test_file,
  notes
)
VALUES
(
  'ADMIN-MFA-LOGIN-001',
  54,
  'Admin Security',
  'Admins must verify a passkey for every login session',
  'Feature: Admin passkey enforcement
  Scenario: Admin starts a new authenticated session
    Given an administrator signs in with password or OAuth
    When the app loads admin-capable routes
    Then the administrator must complete WebAuthn passkey verification for that JWT session
    And the passkey assertion must require user verification
    And trusted-device history must not bypass the new-session gate',
  'implemented',
  'manual',
  '',
  'Per-login passkey verification prevents stolen browser tokens from silently entering admin tools.'
),
(
  'ADMIN-MFA-STEPUP-001',
  54,
  'Admin Security',
  'High-risk admin actions require fresh passkey verification',
  'Feature: Admin high-risk action step-up
  Scenario: Admin attempts a destructive or privilege-changing action
    Given an administrator is signed in
    And their last passkey verification is older than the freshness window
    When they try to purge a user, promote an admin, revoke sessions, or sign out all users
    Then the backend rejects the action
    And the admin must complete passkey verification again before retrying',
  'implemented',
  'manual',
  '',
  'Fresh step-up verification limits damage from unattended sessions and recently stolen tokens.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  feature_area_number = EXCLUDED.feature_area_number,
  feature_area = EXCLUDED.feature_area,
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();