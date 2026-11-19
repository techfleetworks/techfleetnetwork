-- ============================================================================
-- BDD scenarios for Public Access (logged-out class browsing), seeded into
-- public.bdd_scenarios (the repo's CI-tracked feature index). Ticket
-- 34c1a3bddce58092864bc1ac090fe335. Full Gherkin matrix (incl. not-yet-built
-- UI behaviors) lives in
-- supabase/functions/public-class-detail/public-class-detail.feature.
--
-- Only scenarios backed by an existing test are registered here as
-- 'implemented' with a real test_file (per the coverage ratchet: an
-- 'implemented' row must point at a real test). The Phase-B UI/behavioral
-- scenarios are documented in the .feature file and get their DB row + e2e spec
-- when the public pages land.
-- ============================================================================
INSERT INTO public.bdd_scenarios
  (feature_area, feature_area_number, scenario_id, title, gherkin, status, test_type, test_file, notes)
VALUES
('Public Access', 42, 'PUB-CLS-001', 'Public class payload never contains owner_user_id',
$g$Feature: Public class detail gateway — allowlist
  Scenario: owner_user_id is dropped, instructor name derived
    Given a published class owned by a user
    When an anonymous visitor fetches it via public-class-detail
    Then the payload contains the instructor's display name
    And the payload does not contain owner_user_id$g$,
'implemented','unit','supabase/functions/public-class-detail/lib.test.ts','§6; D-A; A3'),

('Public Access', 42, 'PUB-CLS-002', 'Hidden class columns are never exposed to anon',
$g$Feature: Public class detail gateway — allowlist
  Scenario: Non-allowlisted class columns are omitted
    Given the §6 class column allowlist
    When the public class select is built
    Then why_take, audiences, reading_assignments and class_expectations are absent
    And curriculum, short_description and deliverables are present$g$,
'implemented','unit','supabase/functions/public-class-detail/lib.test.ts','§6; D-C superseded; A2'),

('Public Access', 42, 'PUB-CLS-003', 'Cohorts expose only safe fields',
$g$Feature: Public class detail gateway — cohort allowlist
  Scenario: Operational cohort fields never leave the server
    Given the §6 cohort column allowlist
    When a cohort row is mapped for the public payload
    Then only id, label, start_date, end_date and registration_url survive
    And status, capacity, timezone and meeting_url are absent$g$,
'implemented','unit','supabase/functions/public-class-detail/lib.test.ts','§6; A3'),

('Public Access', 42, 'PUB-CLS-010', 'short_description over 140 chars is rejected at the validator',
$g$Feature: Class authoring — short_description cap
  Scenario: Over-long blurb rejected
    Given a class author editing a class
    When they enter a short_description longer than 140 characters
    Then the classFormSchema rejects it$g$,
'implemented','unit','src/test/validators/class.test.ts','§6.1; A1'),

('Public Access', 42, 'PUB-CLS-011', 'Database enforces the 140-char short_description ceiling',
$g$Feature: Class authoring — short_description cap
  Scenario: DB CHECK rejects over-long blurb
    Given a direct insert into public.classes
    When short_description exceeds 140 characters
    Then [DB] the classes_short_description_len CHECK rejects it (SQLSTATE 23514)$g$,
'implemented','both','supabase/tests/class_short_description_test.sql','§6.1; A1'),

('Public Access', 42, 'PUB-CLS-012', 'XSS in short_description is rejected',
$g$Feature: Class authoring — short_description safety
  Scenario: Script payload rejected at the boundary
    Given a class author editing a class
    When they enter a script tag in short_description
    Then the classFormSchema rejects it$g$,
'implemented','unit','src/test/validators/class.test.ts','§6.1; A1; OWASP'),

('Public Access', 42, 'PUB-CLS-013', 'Deliverables reject oversize items and XSS',
$g$Feature: Class authoring — deliverables validation
  Scenario: Caps and sanitization on the deliverables array
    Given a class author editing a class
    When they enter more than 30 deliverables, an item over 200 chars, or a script tag
    Then the classFormSchema rejects it$g$,
'implemented','unit','src/test/validators/class.test.ts','§6.3; A1b; OWASP'),

('Public Access', 42, 'PUB-CLS-014', 'Editing a class never wipes saved deliverables',
$g$Feature: Class authoring — deliverables autosave safety
  Scenario: Autosave preserves loaded deliverables
    Given an existing class that has deliverables
    When the author edits any field and autosave fires
    Then the saved deliverables are preserved, not overwritten with an empty list$g$,
'implemented','unit','src/test/regression/incidents/class-form-deliverables-autosave-wipe-2026-11.test.ts','§6.3; A1b; arch-review F1')

ON CONFLICT (scenario_id) DO UPDATE
SET title = EXCLUDED.title, gherkin = EXCLUDED.gherkin,
    feature_area = EXCLUDED.feature_area, feature_area_number = EXCLUDED.feature_area_number,
    status = EXCLUDED.status, test_type = EXCLUDED.test_type,
    test_file = EXCLUDED.test_file, notes = EXCLUDED.notes, updated_at = now();
