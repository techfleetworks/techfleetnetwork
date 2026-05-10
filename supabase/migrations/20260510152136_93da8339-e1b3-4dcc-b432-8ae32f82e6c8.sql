UPDATE public.agent_fix_queue
SET status = 'dismissed',
    dismissed_at = now(),
    dismissed_reason = 'Optional/transient transport noise (FunctionsFetchError, TypeError: Failed to fetch). Globally suppressed in error-reporter.service.ts; not an actionable code fix.',
    updated_at = now()
WHERE status IN ('pending', 'triaged', 'proposed')
  AND (
    error_message ILIKE '%FunctionsFetchError%'
    OR error_message ILIKE '%Failed to send a request to the Edge Function%'
    OR error_message ILIKE '%TypeError: Failed to fetch%'
    OR error_message ILIKE '%TypeError: NetworkError when attempting to fetch resource%'
    OR error_message ILIKE '%TypeError: Load failed%'
    OR (event_type = 'client_error_deduped' AND error_message ILIKE '%duplicate client error%')
  );