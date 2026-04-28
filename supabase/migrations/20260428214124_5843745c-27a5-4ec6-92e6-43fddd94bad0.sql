INSERT INTO public.bdd_scenarios (
  scenario_id,
  feature_area,
  feature_area_number,
  title,
  gherkin,
  status,
  test_type,
  test_file,
  notes
) VALUES (
  'ARCH-EDGE-SHARED-HTTP-001',
  'Architecture',
  98,
  'Backend functions use shared HTTP and auth foundations',
  'Feature: Backend function architecture\n  Scenario: Shared HTTP and authentication helpers preserve behavior\n    Given backend functions handle CORS, JSON responses, request body limits, and JWT validation\n    When shared HTTP and request authentication helpers are used\n    Then successful requests return the same user-facing responses\n    And invalid methods, invalid JSON, oversize bodies, and unauthenticated requests fail consistently\n    And no product feature behavior changes',
  'implemented',
  'unit',
  'supabase/functions/_shared/http.ts; supabase/functions/_shared/request-auth.ts; supabase/functions/write-exploration-cache/index.ts; supabase/functions/verify-turnstile/index.ts',
  'Deep architecture refactor foundation for scalable, secure edge function patterns.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();