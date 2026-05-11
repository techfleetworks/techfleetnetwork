
-- 1. Trigger: block non-actionable infra events from agent_fix_queue
CREATE OR REPLACE FUNCTION public.block_non_actionable_fix_queue_inserts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_non_actionable text[] := ARRAY[
    'client_error_overflow','client_error_suppressed','client_error_deduped',
    'external_api_recovered','ui_chunk_load_failed','audit_pressure_changed'
  ];
BEGIN
  IF NEW.severity <> 'error' THEN RETURN NULL; END IF;
  IF NEW.event_type = ANY(v_non_actionable) THEN RETURN NULL; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_non_actionable_fix_queue ON public.agent_fix_queue;
CREATE TRIGGER trg_block_non_actionable_fix_queue
BEFORE INSERT ON public.agent_fix_queue
FOR EACH ROW EXECUTE FUNCTION public.block_non_actionable_fix_queue_inserts();

-- 2. Add client_error_overflow to discover_audit_fingerprints exclusions
CREATE OR REPLACE FUNCTION public.discover_audit_fingerprints(p_min_occurrences integer DEFAULT 1)
 RETURNS TABLE(processed integer, queued integer, silenced integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_processed INT := 0; v_queued INT := 0; v_silenced INT := 0;
  r RECORD; v_silence BOOLEAN;
  v_excluded_events CONSTANT text[] := ARRAY[
    'audit_pressure_changed','external_api_recovered','client_error_deduped',
    'client_error_suppressed','client_error_overflow','ui_chunk_load_failed'
  ];
BEGIN
  FOR r IN
    SELECT error_fingerprint AS fingerprint, max(event_type) AS event_type,
           max(table_name) AS source,
           (array_agg(error_message ORDER BY created_at DESC))[1] AS sample_message,
           count(*)::int AS occ, min(created_at) AS first_seen, max(created_at) AS last_seen
    FROM public.audit_log
    WHERE error_message IS NOT NULL AND error_fingerprint IS NOT NULL
      AND created_at > now() - interval '24 hours'
      AND event_type <> ALL (v_excluded_events)
    GROUP BY error_fingerprint
    HAVING count(*) >= p_min_occurrences
  LOOP
    v_processed := v_processed + 1;
    SELECT EXISTS (
      SELECT 1 FROM public.known_issue_catalog k
      WHERE k.is_active AND (k.expires_at IS NULL OR k.expires_at > now())
        AND (k.event_type_filter IS NULL OR k.event_type_filter = r.event_type)
        AND ((k.match_kind = 'substring' AND r.sample_message ILIKE '%' || k.pattern || '%')
          OR (k.match_kind = 'fingerprint' AND r.fingerprint = k.pattern)
          OR (k.match_kind = 'regex' AND r.sample_message ~ k.pattern))
    ) INTO v_silence;
    IF v_silence THEN v_silenced := v_silenced + 1; CONTINUE; END IF;
    INSERT INTO public.agent_fix_queue
      (fingerprint, event_type, source, error_message, severity, status,
       occurrence_count, first_seen_at, last_seen_at)
    VALUES (r.fingerprint, r.event_type, r.source, left(r.sample_message, 4000),
            'error', 'pending', r.occ, r.first_seen, r.last_seen)
    ON CONFLICT (fingerprint) DO UPDATE
      SET occurrence_count = GREATEST(agent_fix_queue.occurrence_count, EXCLUDED.occurrence_count),
          last_seen_at = GREATEST(agent_fix_queue.last_seen_at, EXCLUDED.last_seen_at),
          error_message = COALESCE(NULLIF(agent_fix_queue.error_message,''), EXCLUDED.error_message),
          updated_at = now()
      WHERE agent_fix_queue.status IN ('pending','triaged','proposed');
    v_queued := v_queued + 1;
  END LOOP;
  RETURN QUERY SELECT v_processed, v_queued, v_silenced;
END;
$function$;

-- 3. Auto-dismiss currently-noisy rows
UPDATE public.agent_fix_queue
SET status = 'dismissed', dismissed_at = now(),
    dismissed_reason = 'auto-dismissed: non-actionable infra event (perm fix 2026-05-11)'
WHERE status IN ('pending','triaged','proposed')
  AND (severity <> 'error'
    OR event_type IN ('client_error_overflow','client_error_suppressed','client_error_deduped',
                      'external_api_recovered','ui_chunk_load_failed','audit_pressure_changed')
    OR error_message ILIKE '%dynamically imported module%');

-- 4. Known-issue catalog rules
INSERT INTO public.known_issue_catalog (pattern, match_kind, event_type_filter, reason, is_active)
VALUES
  ('error loading dynamically imported module', 'substring', NULL,
   'Stale-chunk failures are recovered by lazyWithRetry + deploy-watcher; never actionable.', true),
  ('Failed to fetch dynamically imported module', 'substring', NULL,
   'Stale-chunk failures are recovered by lazyWithRetry + deploy-watcher; never actionable.', true),
  ('Importing a module script failed', 'substring', NULL,
   'Stale-chunk failures are recovered by lazyWithRetry + deploy-watcher; never actionable.', true),
  ('client error(s) suppressed by pattern', 'substring', NULL,
   'Aggregate suppression flush — observability only.', true),
  ('duplicate client error(s) deduped', 'substring', NULL,
   'Aggregate dedup flush — observability only.', true)
ON CONFLICT (pattern, match_kind, event_type_filter) DO UPDATE
SET reason = EXCLUDED.reason, is_active = true;

-- 5. BDD scenarios
INSERT INTO public.bdd_scenarios (scenario_id, feature_area, feature_area_number, title, gherkin, status, notes)
VALUES
  ('TRIAGE-NOISE-004', 'Triage', 9, 'Chunk-load errors never enter the Triage queue',
   'Feature: Triage queue noise suppression
  Scenario: Chunk-load failure stays out of Triage
    Given a user has an open browser tab from a prior deploy
    And a new deploy invalidates the previously cached chunk hash
    When the browser fails to fetch the stale chunk
    Then [Code] error-reporter classifies as ui_chunk_load_failed at severity warn
    And [DB] no row is inserted into agent_fix_queue (BEFORE INSERT trigger blocks)
    And [DB] an audit_log row is written for observability
    And [UI] System Health Triage tab shows zero new entries for this event_type',
   'implemented', '[UI][DB][Code]'),
  ('TRIAGE-NOISE-005', 'Triage', 9, 'Aggregate suppression notices never enter Triage',
   'Feature: Triage queue noise suppression
  Scenario: client_error_suppressed flush is observability only
    Given the global error reporter dropped 4 noise events
    When the 60s suppression flush timer fires
    Then [Code] writeAudit is called with event_type=client_error_suppressed severity=warn
    And [DB] an audit_log row is written
    And [DB] no row is inserted into agent_fix_queue
    And [UI] the Triage tab does not show this aggregate notice',
   'implemented', '[UI][DB][Code]'),
  ('TRIAGE-NOISE-006', 'Triage', 9, 'DB trigger rejects non-actionable inserts directly',
   'Feature: Triage queue defense in depth
  Scenario: Direct INSERT of warn-severity row is silently dropped
    Given an admin attempts a direct INSERT with severity=warn
    When the INSERT is executed
    Then [DB] block_non_actionable_fix_queue_inserts trigger returns NULL
    And [DB] no row is added to agent_fix_queue
  Scenario: Direct INSERT of non-actionable event_type is silently dropped
    Given an admin attempts a direct INSERT with event_type=ui_chunk_load_failed
    When the INSERT is executed
    Then [DB] the trigger returns NULL
    And [DB] no row is added to agent_fix_queue',
   'implemented', '[DB]'),
  ('TRIAGE-UI-001', 'Triage', 9, 'Triage tab surfaces only severity=error rows',
   'Feature: Triage tab UX
  Scenario: Default view hides warn/info noise
    Given agent_fix_queue contains rows of severity error, warn, and info
    When an admin opens the System Health Triage tab
    Then [UI] only rows with severity=error are listed
    And [Code] the Supabase query includes .eq("severity","error")
    And [DB] the query returns zero warn/info rows',
   'implemented', '[UI][DB][Code]')
ON CONFLICT (scenario_id) DO UPDATE
SET gherkin = EXCLUDED.gherkin, status = EXCLUDED.status,
    title = EXCLUDED.title, notes = EXCLUDED.notes;
