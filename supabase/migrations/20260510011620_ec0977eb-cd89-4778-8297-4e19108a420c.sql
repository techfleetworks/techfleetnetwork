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
AS $function$
DECLARE
  v_id UUID;
BEGIN
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
$function$;

REVOKE ALL ON FUNCTION public.upsert_fix_queue_entry(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_fix_queue_entry(text, text, text, text, text, text) TO authenticated, service_role;

UPDATE public.agent_fix_queue
SET status = 'dismissed',
    dismissed_at = COALESCE(dismissed_at, now()),
    dismissed_reason = COALESCE(dismissed_reason, 'Optional support chat token fetch is unavailable in the deployed bundle and is now suppressed; not a user-blocking bug.'),
    updated_at = now()
WHERE status = 'pending'
  AND source = 'SupportWidget.token'
  AND fingerprint LIKE 'client_error::SupportWidget.token::%FunctionsFetchError%';

UPDATE public.bdd_scenarios
SET gherkin = 'Feature: System Health Triage Error Remediation

Scenario: Client error reporting writes audit and triage records safely
  Given a signed-in member experiences a reportable client warning
  When the client error reporter writes an audit entry
  Then [UI] the member remains on the same screen without an added prompt, crash, or blocked action
  And [DB] audit_log stores one redacted row owned by that member and agent_fix_queue receives a deduplicated actionable row when severity is warn or error
  And [Code] write_audit_log executes through a security-definer boundary while still rejecting anonymous users and attempts to write for another user

Scenario: Airtable sync tolerates the historical table-name typo
  Given AIRTABLE_TABLE_NAME contains the historical value General Appications
  When sync-airtable prepares the Airtable upsert URL
  Then [UI] application submission continues to return a non-blocking success path to the member
  And [DB] the local application record remains the source of truth even if Airtable rejects a request
  And [Code] sync-airtable normalizes the table name to General Applications before sending the external API request

Scenario: Optional support widget configuration does not reopen stale triage tickets
  Given support chat is not fully configured or cannot be reached
  When a signed-in member loads the app shell or an old browser bundle repeats the same optional-chat warning
  Then [UI] the app shell, navigation, and footer still render without a visible support-chat error
  And [DB] agent_fix_queue keeps dismissed SupportWidget.token rows dismissed while continuing to reopen resolved true regressions
  And [Code] SupportWidget suppresses expected optional-chat setup failures while still reporting unexpected initialization failures',
    updated_at = now()
WHERE scenario_id = 'HEALTH-TRIAGE-FIX-001';