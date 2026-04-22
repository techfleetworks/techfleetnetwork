UPDATE public.bdd_scenarios
SET test_file = 'src/test/ui/FeedbackPage.test.tsx', status = 'implemented'
WHERE scenario_id IN ('FB-1', '36.5', '36.6');

UPDATE public.bdd_scenarios
SET test_file = 'src/test/services/cert-title-utils.test.ts', status = 'implemented'
WHERE scenario_id IN ('PROJ-CERT-007', 'PROJ-CERT-008', 'CLASS-CERT-002');