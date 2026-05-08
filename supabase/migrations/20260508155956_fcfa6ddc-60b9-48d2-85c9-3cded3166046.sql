-- Resolve the user-reported "Feedback contains unsafe content" triage row now that the
-- shared validators no longer treat newlines as header injection in body fields.
UPDATE public.agent_fix_queue
SET status = 'resolved',
    resolved_at = now(),
    dismissed_reason = 'Root cause: safeLongTextSchema rejected any \n / \r\n via hasHeaderInjection. Fixed in src/lib/validators/shared-input.ts: header-injection check now only applies to single-line schemas; safeLongTextSchema and new safeMultilineTextSchema allow newlines. Error messages now name the offending pattern (Heuristic #9). Also reverted the ZodError suppression in error-reporter.service.ts so future false-positives surface in triage.'
WHERE id = '47cb4227-60d5-4930-9fa4-ea04b69a906a';

-- BDD scenarios for the fix (tri-layer Then assertions: UI / DB / Code)
INSERT INTO public.bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin, status, test_type)
VALUES
  ('Feedback', 10, 'BFB-010',
   'Feedback with multiple paragraphs submits successfully',
   E'Feature: Feedback validator allows multi-paragraph body text\n\n  Scenario: User pastes multi-paragraph feedback containing line breaks\n    Given a signed-in user opens the Feedback dialog\n    And the user pastes a message containing two paragraphs separated by \\n\\n\n    When the user clicks "Submit feedback"\n    Then [UI] a success toast "Thanks for your feedback" is shown within 30s\n    And  [DB] a new row exists in public.feedback with the full multi-paragraph message preserved\n    And  [Code] safeLongTextSchema.safeParse returns success: true with no ZodIssue for the message field',
   'not_built', 'none'),
  ('Feedback', 10, 'BFB-011',
   'Feedback containing a script tag is rejected with a specific actionable error',
   E'Feature: Feedback validator surfaces specific reasons for unsafe content\n\n  Scenario: User submits feedback containing a literal <script> tag\n    Given a signed-in user opens the Feedback dialog\n    And the user types a message containing "<script>alert(1)</script>"\n    When the user clicks "Submit feedback"\n    Then [UI] an inline error names the pattern, e.g. "Feedback looks like an HTML/script tag — remove angle brackets and try again"\n    And  [DB] no new row is inserted into public.feedback\n    And  [Code] safeLongTextSchema.safeParse returns success: false with a ZodIssueCode.custom issue whose message contains "HTML/script tag"',
   'not_built', 'none'),
  ('Applications', 22, 'BAP-022',
   'Professional goals accepts paragraph breaks',
   E'Feature: Profile and general-application professional_goals supports multi-paragraph input\n\n  Scenario: User saves professional_goals containing line breaks\n    Given a signed-in user is on the profile setup screen\n    And the user types professional_goals with two paragraphs separated by \\n\\n\n    When the user clicks "Save"\n    Then [UI] no "contains unsafe content" error is shown and the save succeeds with a success toast\n    And  [DB] public.profiles.professional_goals stores the value with newlines preserved\n    And  [Code] profileSchema.safeParse returns success: true and safeMultilineTextSchema accepts the value',
   'not_built', 'none')
ON CONFLICT (scenario_id) DO UPDATE
  SET title = EXCLUDED.title, gherkin = EXCLUDED.gherkin, updated_at = now();