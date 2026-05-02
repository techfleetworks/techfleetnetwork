-- Seed BDD scenarios for Career Plan + Skills & Practices framework KB integration
INSERT INTO public.bdd_scenarios (scenario_id, feature_area, feature_area_number, title, gherkin, status, test_type, notes)
VALUES
('RES-SP-011', 'Resources › Skills & Practices', 61, 'Browse empty state hides admin URL',
$$Feature: Skills & Practices framework empty state
  Scenario: Empty entity table never reveals the admin ingest URL
    Given a non-admin user is viewing the Skills & Practices tab
    And the selected entity has zero rows in its reference_* table
    When the empty state renders
    Then the UI [UI] shows "No items to display yet. Please check back soon."
    And the UI [UI] contains no anchor whose href matches "/admin/ingest"
    And the DOM [UI] contains no occurrence of the substring "/admin/ingest" or the word "Admins"
    And the database [DB] reference_<entity> count(*) is 0 (precondition holds)
    And the code [Code] SkillsPracticesTab.tsx renders the EmptyState branch with neutral copy only$$,
'not_built', 'none', 'Hardens against information disclosure (CWE-200) in framework empty states.'),

('RES-SP-012', 'Resources › Skills & Practices', 61, 'Framework data syncs to knowledge_base',
$$Feature: Framework → knowledge_base sync
  Scenario: Inserting a reference row mirrors it into knowledge_base via trigger
    Given an admin inserts a new row into reference_skills with slug "test-skill-001"
    When the trg_fw_kb_sync trigger fires
    Then the database [DB] knowledge_base contains exactly one row with url "framework://skills/test-skill-001"
    And the knowledge_base [DB] row title equals the reference row name
    And the knowledge_base [DB] row content includes the description and category
    And updating the reference row [DB] re-upserts the same knowledge_base row (no duplicates by url)
    And deleting the reference row [DB] removes the matching knowledge_base row
    And the code [Code] tg_sync_reference_to_kb function uses SECURITY DEFINER with pinned search_path = public$$,
'not_built', 'none', 'Verifies trigger-driven framework KB mirror used by Fleety.'),

('CAR-PLN-001', 'Career Plan', 80, 'User generates a plan from a target Job Title',
$$Feature: Career Plan generation
  Scenario: Authenticated user generates a deterministic plan
    Given an authenticated user with no existing career_plan row
    And reference_job_titles contains at least one published target
    When the user picks a target Job Title and clicks "Generate plan"
    Then the UI [UI] shows the grouped checklist within 3 seconds
    And the UI [UI] groups items by entity (Activities, Team Practices, Job Duties, Technical & Interpersonal Skills)
    And each card [UI] displays the rationale sentence pulled from reference_relationships.description
    And the database [DB] career_plans contains exactly one row for auth.uid() with the chosen target_job_title_id
    And the database [DB] career_plan_items contains one row per related framework entity, all with auto_generated = true and status = 'not_started'
    And the code [Code] generate-career-plan edge function returned HTTP 200 with a plan_id matching the inserted row$$,
'not_built', 'none', 'Happy-path generation, deterministic graph walk.'),

('CAR-PLN-002', 'Career Plan', 80, 'Regenerating preserves user status and manual items',
$$Feature: Career Plan idempotency
  Scenario: Re-running generation keeps existing progress
    Given the user already has a career_plan with 12 auto_generated items
    And the user has marked 3 items status = 'in_progress' and added 1 manual item (auto_generated = false)
    When the user clicks "Regenerate plan" with the same target
    Then the UI [UI] still shows the 3 in_progress items with their status preserved
    And the UI [UI] still shows the manual item
    And the database [DB] career_plan_items count for auto_generated = true is unchanged or refreshed (no orphans)
    And the database [DB] no auto_generated row had its status reset from 'in_progress' to 'not_started'
    And the database [DB] the manual item row is untouched (auto_generated = false preserved)
    And the code [Code] generate-career-plan upserts on (plan_id, item_type, reference_id) and never DELETEs auto_generated = false rows$$,
'not_built', 'none', 'Critical for trust — users must not lose progress on regenerate.'),

('CAR-PLN-003', 'Career Plan', 80, 'Non-owner cannot read or modify another user''s plan',
$$Feature: Career Plan RLS
  Scenario: RLS blocks cross-user access
    Given user A owns a career_plan with 5 items
    And user B is authenticated as a different non-admin user
    When user B issues SELECT, UPDATE, and DELETE against career_plans and career_plan_items for user A's plan_id
    Then the API [Code] returns zero rows on SELECT and zero rows affected on UPDATE/DELETE
    And the database [DB] user A's career_plans row is byte-identical before and after user B's attempts
    And the UI [UI] never renders user A's plan when user B navigates to /career-plan
    And the database [DB] RLS policies "Users view own career plan", "Users update own career plan", "Users delete own career plan" all use auth.uid() = user_id$$,
'not_built', 'none', 'Defense-in-depth: confirms RLS owner scoping holds.'),

('FLEETY-FRAMEWORK-001', 'Fleety Chatbot', 18, 'Fleety prioritizes framework:// KB entries for relationship questions',
$$Feature: Fleety framework relationship awareness
  Scenario: Asking about Job Duty → Skill relationships pulls from framework KB
    Given knowledge_base contains framework:// entries synced from reference_relationships
    And a user asks Fleety "What skills do I need to perform the Scrum Master Job Duty?"
    When the techfleet-chat edge function builds the prompt and the model responds
    Then the response [UI] cites at least one source whose URL begins with "framework://"
    And the response [UI] quotes or paraphrases the canonical relationship sentence from reference_relationships.description
    And the response [UI] uses the canonical terms "Technical & Interpersonal Skills" and "Job Duties" (never "Hard Skills" or "Roles")
    And the database [DB] knowledge_base WHERE url LIKE 'framework://%' returned >= 1 row in the prompt builder
    And the code [Code] SYSTEM_PROMPT rule #1 contains the literal substring "framework://" instructing the model to prioritize those entries$$,
'not_built', 'none', 'Verifies the system prompt + KB sync end-to-end behavior.')
ON CONFLICT (scenario_id) DO UPDATE SET
  feature_area = EXCLUDED.feature_area,
  feature_area_number = EXCLUDED.feature_area_number,
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  notes = EXCLUDED.notes,
  updated_at = now();