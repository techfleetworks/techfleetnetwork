DROP TRIGGER IF EXISTS trg_audit_grid_view_states_change ON public.grid_view_states;

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
VALUES (
  'AUDIT-NOISE-001',
  53,
  'Admin Activity Log',
  'Grid layout preference changes do not create activity log noise',
  'Feature: Admin Activity Log Noise Reduction
  Scenario: Routine grid preference saves are excluded from audit logging
    Given an authenticated user changes a table column width, sort, filter, or layout
    When the application saves the user grid preference in grid_view_states
    Then no audit_log row is created for grid_view_states_insert, grid_view_states_update, or grid_view_states_delete
    And security-critical events remain visible in the admin activity log',
  'implemented',
  'manual',
  '',
  'Routine UI preference persistence is high-volume and low-risk, so it must not crowd out security-relevant audit events.'
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