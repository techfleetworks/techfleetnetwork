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
  'AUTH-ADMIN-2FA-DETECTION-017',
  'Authentication and admin security',
  91,
  'Verified admin authenticator factors suppress setup grace warnings',
  'Feature: Admin authenticator setup detection\n  Scenario: Admin with verified authenticator factor does not see setup grace banner\n    Given an administrator has completed Google Authenticator-compatible 2FA setup\n    And the authentication provider returns verified TOTP factors in a typed factor list\n    When the admin route checks 2FA setup status\n    Then the verified TOTP factor must be recognized\n    And the admin 2FA setup grace warning must not render\n    And admin access remains protected by fresh 2FA checks for sensitive actions',
  'implemented',
  'unit',
  'src/test/services/mfa.service.test.ts',
  'Regression coverage for robust MFA factor response normalization after admins complete TOTP setup.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();