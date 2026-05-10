UPDATE public.agent_fix_queue
SET status='dismissed', dismissed_at=now(), dismissed_reason='AbortError is expected request cancellation; suppressed in client + service layers.'
WHERE status='pending'
  AND error_message ILIKE '%AbortError%aborted%';

INSERT INTO public.bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin, status, test_type, notes)
SELECT 'Error Reporting', 18, 'ERR-ABORT-001',
  'AbortError from cancelled requests is not reported',
  'Feature: Suppress cancelled-request noise from telemetry

  Scenario: Cancelled React Query does not pollute audit_log
    Given a service call wrapped by handleServiceError is in-flight
    When the caller aborts the request (unmount, route change, query key change)
    Then [Code] handleServiceError re-throws DOMException("AbortError") without invoking the logger
    And  [DB] no audit_log row with event_type=client_error containing "operation was aborted" is written
    And  [UI] no toast or ErrorBoundary surface is shown to the user',
  'implemented', 'unit',
  'Added May 2026 to fix 133-occurrence noise spike from list/getReadIds cancellations.'
WHERE NOT EXISTS (SELECT 1 FROM public.bdd_scenarios WHERE scenario_id='ERR-ABORT-001');