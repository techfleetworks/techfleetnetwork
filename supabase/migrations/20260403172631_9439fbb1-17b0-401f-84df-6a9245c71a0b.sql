INSERT INTO public.bdd_scenarios (scenario_id, feature_area, feature_area_number, title, gherkin, test_type, status)
VALUES
  ('GA-REVIEW-001', 'General Application', 6, 'Review step shows all answers before submission',
   E'Feature: General Application Review Step\n\nScenario: User sees review step as final step\n  Given the user has completed sections 1 through 5\n  When the user navigates to the last step\n  Then a Review section is displayed showing all answers from all 5 sections\n  And each section shows a Complete or Incomplete badge\n  And each section has an Edit button to navigate back\n\nScenario: User submits from review step\n  Given the user is on the review step\n  And all 5 content sections are complete\n  When the user clicks Submit Application\n  Then the application is submitted successfully',
   'manual', 'not_built')
ON CONFLICT (scenario_id) DO NOTHING;