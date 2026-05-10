ALTER TABLE public.audit_event_policy
  ADD COLUMN IF NOT EXISTS min_occurrences_before_escalate INT NOT NULL DEFAULT 1;

DROP FUNCTION IF EXISTS public.get_audit_policy();

CREATE OR REPLACE FUNCTION public.get_audit_policy()
RETURNS TABLE(
  event_type_pattern text,
  cap_per_minute integer,
  dedup_window_seconds integer,
  min_occurrences_before_escalate integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT event_type_pattern, cap_per_minute, dedup_window_seconds, min_occurrences_before_escalate
  FROM public.audit_event_policy;
$function$;

INSERT INTO public.audit_event_policy
  (event_type_pattern, cap_per_minute, dedup_window_seconds, min_occurrences_before_escalate, notes)
VALUES
  ('client_error::query.announcements.%', 5, 300, 3,
   'Polling fetch failures are usually transient network blips; only escalate if 3+ within 5 min.')
ON CONFLICT (event_type_pattern) DO UPDATE
  SET min_occurrences_before_escalate = EXCLUDED.min_occurrences_before_escalate,
      cap_per_minute = EXCLUDED.cap_per_minute,
      dedup_window_seconds = EXCLUDED.dedup_window_seconds,
      notes = EXCLUDED.notes;