DROP TABLE IF EXISTS public.career_plan_items CASCADE;
DROP TABLE IF EXISTS public.career_plans CASCADE;

DELETE FROM public.bdd_scenarios
WHERE scenario_id IN ('CAR-PLN-001','CAR-PLN-002','CAR-PLN-003','FLEETY-FRAMEWORK-001');

INSERT INTO public.bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin)
VALUES
('Resources', 1, 'RES-SP-015', 'Skills & Practices exposes only Overview and Browse sub-tabs',
$gh$Feature: Skills & Practices tab UI surface
  Scenario: Map and Relationships sub-tabs are removed
    Given a signed-in member opens Resources > Skills & Practices
    When the tab renders
    Then [UI] only the "Overview" and "Browse" sub-tabs are visible
    And [UI] no "Map" or "Relationships" controls are present
    And [Code] no MapView or RelationshipsView component is mounted
$gh$),
('Navigation', 1, 'NAV-001', 'Career Plan is not exposed in navigation',
$gh$Feature: Sidebar navigation
  Scenario: Career Plan entry is removed
    Given a signed-in user views the sidebar
    Then [UI] no "Career Plan" link is rendered
    And [UI] visiting /career-plan resolves to the NotFound page
    And [DB] the career_plans and career_plan_items tables do not exist
$gh$)
ON CONFLICT (scenario_id) DO UPDATE SET gherkin = EXCLUDED.gherkin, title = EXCLUDED.title;