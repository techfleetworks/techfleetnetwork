CREATE TABLE IF NOT EXISTS public.dead_client_sources (
  source text PRIMARY KEY,
  reason text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dead_client_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage dead_client_sources" ON public.dead_client_sources;
CREATE POLICY "Admins manage dead_client_sources"
  ON public.dead_client_sources
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.dead_client_sources (source, reason)
VALUES ('SupportWidget.token',
        'Chatwoot prototype removed May 2026; residual stale-bundle noise.')
ON CONFLICT (source) DO NOTHING;

CREATE OR REPLACE FUNCTION public.audit_log_drop_dead_sources()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_field text;
  v_source text;
BEGIN
  IF NEW.event_type IN ('client_error', 'client_error_suppressed', 'client_error_deduped')
     AND NEW.changed_fields IS NOT NULL THEN
    FOREACH v_field IN ARRAY NEW.changed_fields LOOP
      IF v_field LIKE 'source:%' THEN
        v_source := substring(v_field FROM 8);
        IF EXISTS (SELECT 1 FROM public.dead_client_sources WHERE source = v_source) THEN
          RETURN NULL;
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_drop_dead_sources_t ON public.audit_log;
CREATE TRIGGER audit_log_drop_dead_sources_t
BEFORE INSERT ON public.audit_log
FOR EACH ROW
EXECUTE FUNCTION public.audit_log_drop_dead_sources();

CREATE OR REPLACE FUNCTION public.upsert_fix_queue_entry(
  p_fingerprint text,
  p_event_type text,
  p_source text,
  p_error_message text,
  p_severity text DEFAULT 'error'::text,
  p_sample_trace_id text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_source IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.dead_client_sources WHERE source = p_source) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.agent_fix_queue (
    fingerprint, event_type, source, error_message, severity, sample_trace_id
  ) VALUES (
    p_fingerprint, p_event_type, p_source,
    LEFT(COALESCE(p_error_message, ''), 4000),
    COALESCE(p_severity, 'error'),
    p_sample_trace_id
  )
  ON CONFLICT (fingerprint) DO UPDATE
    SET occurrence_count = public.agent_fix_queue.occurrence_count + 1,
        last_seen_at = now(),
        status = CASE
          WHEN public.agent_fix_queue.status = 'resolved'
            THEN 'pending'
          ELSE public.agent_fix_queue.status
        END,
        sample_trace_id = COALESCE(EXCLUDED.sample_trace_id, public.agent_fix_queue.sample_trace_id),
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_fix_queue_entry(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_fix_queue_entry(text, text, text, text, text, text) TO authenticated, service_role;

UPDATE public.agent_fix_queue q
SET status = 'dismissed',
    dismissed_at = COALESCE(q.dismissed_at, now()),
    dismissed_reason = COALESCE(q.dismissed_reason,
      'Auto-dismissed: source registered in dead_client_sources lookup.'),
    updated_at = now()
FROM public.dead_client_sources d
WHERE q.status = 'pending' AND q.source = d.source;

INSERT INTO public.bdd_scenarios (scenario_id, feature_area, feature_area_number, title, gherkin, status)
SELECT 'DEAD-CLIENT-SOURCE-001', 'System Health Triage', 1,
'Dead Client Source Suppression',
'Feature: Dead Client Source Suppression

Scenario: Stale-bundle telemetry from a removed feature is silently dropped
  Given a client component named SupportWidget was removed from the codebase
  And the source SupportWidget.token is registered in dead_client_sources
  When a cached old browser tab posts a client_error with source SupportWidget.token to write_audit_log
  Then [UI] no admin-facing alert, digest entry, or Triage ticket appears for that source
  And [DB] the audit_log row is rejected by the BEFORE INSERT trigger and agent_fix_queue is not modified
  And [Code] upsert_fix_queue_entry returns NULL for any p_source listed in dead_client_sources

Scenario: Live components are unaffected by the dead-source filter
  Given a live component DashboardPage is NOT registered in dead_client_sources
  When a real client_error is reported with source DashboardPage.handleX
  Then [UI] the error continues to surface in System Health Triage as before
  And [DB] the audit_log row is inserted and the hash chain advances
  And [Code] upsert_fix_queue_entry creates or reopens the matching agent_fix_queue row',
'implemented'::bdd_status
WHERE NOT EXISTS (
  SELECT 1 FROM public.bdd_scenarios WHERE scenario_id = 'DEAD-CLIENT-SOURCE-001'
);
