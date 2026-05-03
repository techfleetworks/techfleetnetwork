UPDATE public.bdd_scenarios
SET gherkin = 'Feature: Sidebar and route cleanup
  Scenario: Career Plan, Map, and Relationships entries are removed
    Given a signed-in user views the application
    Then [UI] the sidebar renders no "Career Plan", "Map", or "Relationships" link
    And [UI] visiting /career-plan resolves to the NotFound page
    And [UI] visiting /skills-practices/map and /skills-practices/relationships resolve to the NotFound page
    And [Code] no React Router <Route> exists for /career-plan, /skills-practices/map, or /skills-practices/relationships
    And [DB] the career_plans and career_plan_items tables do not exist',
    title = 'Career Plan, Map, and Relationships are not exposed in navigation or routing'
WHERE scenario_id = 'NAV-001';

UPDATE public.bdd_scenarios
SET gherkin = 'Feature: Skills & Practices tab UI surface
  Scenario: Map and Relationships sub-tabs are removed
    Given a signed-in member opens Resources > Skills & Practices
    When the tab renders
    Then [UI] only the "Overview" and "Browse" sub-tabs are visible
    And [UI] no "Map" or "Relationships" trigger, link, or content is present
    And [Code] SkillsPracticesTab.tsx imports no MapView or RelationshipsView component
    And [Code] no lazy import path references skills-practices/MapView or skills-practices/RelationshipsView
    And [DB] reference_* tables and framework_entity_v continue to return active rows for authenticated reads'
WHERE scenario_id = 'RES-SP-015';

INSERT INTO public.bdd_scenarios (scenario_id, title, feature_area, feature_area_number, gherkin, status)
VALUES (
  'RES-SP-016',
  'Skills & Practices read-only access remains intact for signed-in users',
  'Resources - Skills & Practices',
  COALESCE((SELECT feature_area_number FROM public.bdd_scenarios WHERE scenario_id = 'RES-SP-015'), 0),
  'Feature: Skills & Practices read-only access regression guard
  Scenario: A signed-in user loads framework data after Career Plan/Map/Relationships removal
    Given the Career Plan, Map, and Relationships features have been removed
    And active rows exist in reference_skills, reference_practices, reference_activities, and reference_duties
    When a signed-in member opens Resources > Skills & Practices > Browse
    Then [UI] the Browse view displays skill, practice, activity, and duty cards (not the empty state)
    And [UI] the Overview tab continues to render framework summary content
    And [Code] reference.service and framework.service successfully fetch rows via the authenticated supabase client without errors
    And [DB] SELECT on reference_* tables and framework_entity_v succeeds for the authenticated role
    And [DB] INSERT, UPDATE, and DELETE on reference_* tables remain rejected by RESTRICTIVE RLS policies',
  'not_built'
)
ON CONFLICT (scenario_id) DO UPDATE
SET gherkin = EXCLUDED.gherkin, title = EXCLUDED.title, feature_area = EXCLUDED.feature_area;