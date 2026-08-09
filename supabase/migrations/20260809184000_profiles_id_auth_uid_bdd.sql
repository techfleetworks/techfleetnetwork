-- BDD scenario for audit T-A — profiles.id vs auth.uid() identity confusion.
BEGIN;

INSERT INTO public.bdd_scenarios
  (scenario_id, feature_area, feature_area_number, title, gherkin, status, test_type, test_file, notes)
VALUES
  ('PROFILES-ID-TA-001', 'Access control', 62,
   'Identity lookups key on profiles.user_id (auth uid), never the random PK',
   'Feature: correct profile identity key\n  Scenario: record consent\n    Given an authenticated user acknowledges a policy with electronic_comms consent\n    When record_policy_ack runs\n    Then it persists electronic_comms_consent_at on the profile keyed by user_id (not the PK, which no-oped)\n  Scenario: freescout provisioning by auth uid\n    Given a worker provisions/syncs a Freescout customer for an auth uid\n    Then it resolves the profile via user_id (was .eq("id", authUid) -> 0 rows -> GDPR anonymize skipped)\n  Scenario: regression guard\n    Given a new .from("profiles").eq("id", <authUid>) or a profiles UPDATE ... WHERE id = auth.uid()\n    Then check-profiles-id-auth-uid.mjs fails CI',
   'implemented', 'unit',
   'src/test/smoke/profiles-id-auth-uid.smoke.test.ts',
   'T-A: fixed record_policy_ack (migration), freescout-provision/sync-customer, support-provisioning-retry, process-freescout-events:170. DB behavior proven in supabase/tests/record_policy_ack_test.sql. Lint guard scripts/ci/check-profiles-id-auth-uid.mjs wired into ci.yml lint-arch.')
ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title, gherkin = EXCLUDED.gherkin, status = EXCLUDED.status,
  test_type = EXCLUDED.test_type, test_file = EXCLUDED.test_file,
  feature_area = EXCLUDED.feature_area, feature_area_number = EXCLUDED.feature_area_number,
  notes = EXCLUDED.notes, updated_at = now();

COMMIT;
