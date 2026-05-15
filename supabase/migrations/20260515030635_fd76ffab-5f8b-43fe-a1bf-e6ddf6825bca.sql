CREATE OR REPLACE FUNCTION public.discover_audit_fingerprints(p_min_occurrences integer DEFAULT 1)
 RETURNS TABLE(processed integer, queued integer, silenced integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_processed INT := 0; v_queued INT := 0; v_silenced INT := 0;
  r RECORD; v_silence BOOLEAN;
  v_excluded_events CONSTANT text[] := ARRAY[
    'audit_pressure_changed','external_api_recovered','client_error_deduped',
    'client_error_suppressed','client_error_overflow','ui_chunk_load_failed',
    -- Admin status-change meta-events: writing them back to the queue would
    -- create a resolve→audit→requeue feedback loop.
    'fix_queue_status_changed','fix_queue_triaged','fix_queue_proposed','fix_queue_dismissed'
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