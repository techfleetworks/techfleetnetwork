UPDATE public.agent_fix_queue
SET status='dismissed', dismissed_at=now(),
    dismissed_reason='Fixed: lazyWithRetry now clears reload flag on success + cache-busts recovery reload, so stale chunks recover even after multiple deploys on the same tab.'
WHERE status='pending'
  AND error_message ILIKE '%error loading dynamically imported module%';

INSERT INTO public.bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin, status, test_type, notes)
SELECT 'Deployment', 24, 'DEPLOY-STALE-002',
  'lazyWithRetry recovers from stale chunks across multiple deploys',
  'Feature: Resilient stale-chunk recovery

  Scenario: Second stale-chunk after a recovery reload still recovers
    Given a tab has already used its one-shot recovery reload earlier in the session
    And  another deploy ships and a different lazy chunk hash is now invalid
    When the user triggers a code-split import in that tab
    Then [Code] lazyWithRetry clears RELOAD_FLAG on each successful import, restoring the recovery budget
    And  [Code] on exhausted retries it cache-busts the reload via a __r query param so the freshest index.html is fetched
    And  [DB] no new ui_render_error row with "error loading dynamically imported module" reaches agent_fix_queue
    And  [UI] the user does not see ErrorBoundary; the page reloads silently and renders the component',
  'implemented', 'unit',
  'Added May 2026 to fix repeat stale-chunk errors on Dashboard NetworkActivity.'
WHERE NOT EXISTS (SELECT 1 FROM public.bdd_scenarios WHERE scenario_id='DEPLOY-STALE-002');