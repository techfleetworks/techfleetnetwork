UPDATE public.bdd_scenarios
SET status = 'implemented',
    test_type = 'unit',
    test_file = 'src/test/ui/AdminProjects.test.tsx',
    updated_at = now()
WHERE feature_area = 'Admin Projects'
  AND scenario_id IN ('PROJECT-001','PROJECT-002','PROJECT-003','PROJECT-004','PROJECT-005','PROJECT-006','PROJECT-007');