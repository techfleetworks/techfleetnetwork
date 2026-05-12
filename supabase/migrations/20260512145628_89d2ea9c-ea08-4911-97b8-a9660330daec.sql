
-- 1) Block validation_rejected from ever entering the triage queue
CREATE OR REPLACE FUNCTION public.block_non_actionable_fix_queue_inserts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_non_actionable text[] := ARRAY[
    'client_error_overflow','client_error_suppressed','client_error_deduped',
    'external_api_recovered','ui_chunk_load_failed','audit_pressure_changed',
    'validation_rejected'
  ];
BEGIN
  IF NEW.severity <> 'error' THEN RETURN NULL; END IF;
  IF NEW.event_type = ANY(v_non_actionable) THEN RETURN NULL; END IF;
  RETURN NEW;
END;
$$;

-- 2) Dismiss the 3 stale validation_rejected entries
UPDATE public.agent_fix_queue
SET status = 'dismissed',
    dismissed_at = now(),
    dismissed_reason = 'User-input validation rejection — not a code bug. Catalogued as known noise; future occurrences blocked from triage queue.',
    updated_at = now()
WHERE status = 'pending'
  AND event_type = 'validation_rejected';

-- 3) Add validation_rejected to known_issue_catalog (best-effort; ignore if missing)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='known_issue_catalog'
  ) THEN
    INSERT INTO public.known_issue_catalog (pattern, reason, created_at)
    VALUES (
      'validation_rejected',
      'Zod schema rejection of user input (bad URL, short password, missing field). Surfaced in audit_log for UX analytics; intentionally excluded from triage queue.',
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
