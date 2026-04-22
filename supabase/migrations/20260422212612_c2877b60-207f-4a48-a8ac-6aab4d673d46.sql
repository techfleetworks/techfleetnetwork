UPDATE public.bdd_scenarios
SET test_file = NULL
WHERE test_file IS NOT NULL
  AND test_file NOT LIKE '%.test.%'
  AND test_file NOT LIKE '%.spec.%';