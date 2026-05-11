-- 1. Known-issue catalog: silence stale-bundle chunk-load noise
INSERT INTO public.known_issue_catalog (pattern, match_kind, event_type_filter, reason, is_active)
VALUES
  ('error loading dynamically imported module', 'substring', 'ui_render_error',
   'Stale-bundle chunk-load — handled by lazy-with-retry hard reload; ErrorBoundary now reports as ui_chunk_load_failed/warn.', true),
  ('Failed to fetch dynamically imported module', 'substring', 'ui_render_error',
   'Stale-bundle chunk-load — handled by lazy-with-retry hard reload.', true),
  ('Importing a module script failed', 'substring', 'ui_render_error',
   'Stale-bundle chunk-load — handled by lazy-with-retry hard reload.', true),
  ('Failed to count progress', 'substring', 'client_error',
   'Transient PostgREST blip in journey progress count; downgraded to info via QueryCache.onError.', true)
ON CONFLICT DO NOTHING;

-- 2. Dismiss historical queue rows that match the new rules
UPDATE public.agent_fix_queue
SET status = 'dismissed',
    dismissed_at = COALESCE(dismissed_at, now()),
    dismissed_reason = COALESCE(dismissed_reason,
      'Auto-dismissed: stale-chunk noise / informational event reclassified.'),
    updated_at = now()
WHERE status IN ('pending','triaged','proposed')
  AND (
    error_message ILIKE '%dynamically imported module%'
    OR error_message ILIKE '%Failed to count progress%'
    OR event_type IN (
      'audit_pressure_changed',
      'external_api_recovered',
      'client_error_deduped',
      'client_error_suppressed',
      'ui_chunk_load_failed'
    )
  );

-- 3. Rewrite discover_audit_fingerprints to skip informational/handled event types
CREATE OR REPLACE FUNCTION public.discover_audit_fingerprints(p_min_occurrences INT DEFAULT 1)
RETURNS TABLE(processed INT, queued INT, silenced INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed INT := 0;
  v_queued INT := 0;
  v_silenced INT := 0;
  r RECORD;
  v_silence BOOLEAN;
  -- Event types that are informational / already-handled and should never
  -- become Triage tickets, regardless of error_message presence.
  v_excluded_events CONSTANT text[] := ARRAY[
    'audit_pressure_changed',
    'external_api_recovered',
    'client_error_deduped',
    'client_error_suppressed',
    'ui_chunk_load_failed'
  ];
BEGIN
  FOR r IN
    SELECT
      error_fingerprint AS fingerprint,
      max(event_type) AS event_type,
      max(table_name) AS source,
      (array_agg(error_message ORDER BY created_at DESC))[1] AS sample_message,
      count(*)::int AS occ,
      min(created_at) AS first_seen,
      max(created_at) AS last_seen
    FROM public.audit_log
    WHERE error_message IS NOT NULL
      AND error_fingerprint IS NOT NULL
      AND created_at > now() - interval '24 hours'
      AND event_type <> ALL (v_excluded_events)
    GROUP BY error_fingerprint
    HAVING count(*) >= p_min_occurrences
  LOOP
    v_processed := v_processed + 1;

    SELECT EXISTS (
      SELECT 1 FROM public.known_issue_catalog k
      WHERE k.is_active
        AND (k.expires_at IS NULL OR k.expires_at > now())
        AND (k.event_type_filter IS NULL OR k.event_type_filter = r.event_type)
        AND (
          (k.match_kind = 'substring'   AND r.sample_message ILIKE '%' || k.pattern || '%') OR
          (k.match_kind = 'fingerprint' AND r.fingerprint = k.pattern) OR
          (k.match_kind = 'regex'       AND r.sample_message ~ k.pattern)
        )
    ) INTO v_silence;

    IF v_silence THEN
      v_silenced := v_silenced + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.agent_fix_queue
      (fingerprint, event_type, source, error_message, severity,
       status, occurrence_count, first_seen_at, last_seen_at)
    VALUES
      (r.fingerprint, r.event_type, r.source, left(r.sample_message, 4000),
       'error', 'pending', r.occ, r.first_seen, r.last_seen)
    ON CONFLICT (fingerprint) DO UPDATE
      SET occurrence_count = GREATEST(agent_fix_queue.occurrence_count, EXCLUDED.occurrence_count),
          last_seen_at     = GREATEST(agent_fix_queue.last_seen_at, EXCLUDED.last_seen_at),
          error_message    = COALESCE(NULLIF(agent_fix_queue.error_message,''), EXCLUDED.error_message),
          updated_at       = now()
      WHERE agent_fix_queue.status IN ('pending','triaged','proposed');

    v_queued := v_queued + 1;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_queued, v_silenced;
END;
$$;

REVOKE ALL ON FUNCTION public.discover_audit_fingerprints(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discover_audit_fingerprints(INT) TO service_role;

-- 4. BDD coverage
INSERT INTO public.bdd_scenarios (scenario_id, feature_area, feature_area_number, title, gherkin, status)
SELECT v.scenario_id, 'System Health Triage', 1, v.title, v.gherkin, 'implemented'::bdd_status
FROM (VALUES
  ('TRIAGE-NOISE-001',
   'Stale chunk-load errors never enter the Triage queue',
   'Feature: Triage queue ignores stale-bundle chunk-load noise

Scenario: A user on a stale tab triggers a chunk-load failure
  Given the deployment has rotated to a new bundle hash
  And a user still on the previous bundle navigates to a lazy route
  When ErrorBoundary catches "error loading dynamically imported module"
  Then [UI] no row appears in the System Health Triage queue
  And [DB] discover_audit_fingerprints excludes ui_chunk_load_failed and known_issue_catalog matches "error loading dynamically imported module"
  And [Code] ErrorBoundary reports the error as ui_chunk_load_failed with severity warn (not ui_render_error/error)'),
  ('TRIAGE-NOISE-002',
   'Transient PostgREST failures in getCompletedCount stay silent',
   'Feature: Transient query failures are not actionable triage tickets

Scenario: getCompletedCount fails because of a transient network blip
  Given the user is loading the journey progress widget
  When the PostgREST call fails with TypeError "Failed to fetch"
  Then [UI] no Triage row, no error toast, no audit_log error appears
  And [DB] no agent_fix_queue row is created for that fingerprint
  And [Code] QueryCache.onError detects isTransientError(err) === true and returns without calling reportError'),
  ('TRIAGE-NOISE-003',
   'Informational events like audit_pressure_changed never become tickets',
   'Feature: Informational state-transition events are excluded from Triage discovery

Scenario: audit_pressure_changed transitions hard to none
  Given the email-pipeline-health probe detects an audit_log volume change
  When write_audit_log records event_type=audit_pressure_changed
  Then [UI] no row appears in the Triage queue for that event_type
  And [DB] discover_audit_fingerprints filters event_type out of its candidate set
  And [Code] the queue exclusion list includes audit_pressure_changed, external_api_recovered, client_error_deduped, client_error_suppressed, ui_chunk_load_failed')
) AS v(scenario_id, title, gherkin)
WHERE NOT EXISTS (
  SELECT 1 FROM public.bdd_scenarios b WHERE b.scenario_id = v.scenario_id
);