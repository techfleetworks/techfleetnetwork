
-- 1. Audit log table
CREATE TABLE IF NOT EXISTS public.triage_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fix_queue_id UUID NOT NULL REFERENCES public.agent_fix_queue(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  matching_signal TEXT,
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_triage_audit_log_fix_queue
  ON public.triage_audit_log(fix_queue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_triage_audit_log_created
  ON public.triage_audit_log(created_at DESC);

ALTER TABLE public.triage_audit_log ENABLE ROW LEVEL SECURITY;

-- Admin-only read.
CREATE POLICY "Admins can read triage audit log"
  ON public.triage_audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No client writes; rows come from a trigger (SECURITY DEFINER context).
REVOKE INSERT, UPDATE, DELETE ON public.triage_audit_log FROM PUBLIC, anon, authenticated;

-- Block UPDATE/DELETE even from elevated paths to keep the log immutable.
CREATE OR REPLACE FUNCTION public.triage_audit_log_block_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'triage_audit_log is append-only';
END;
$$;

DROP TRIGGER IF EXISTS triage_audit_log_no_update ON public.triage_audit_log;
CREATE TRIGGER triage_audit_log_no_update
  BEFORE UPDATE OR DELETE ON public.triage_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.triage_audit_log_block_mutation();

-- 2. Heuristic classifier — picks a rule name from the new status and reason.
CREATE OR REPLACE FUNCTION public.classify_triage_rule(
  p_to_status TEXT,
  p_from_status TEXT,
  p_reason TEXT
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  r TEXT := lower(coalesce(p_reason, ''));
BEGIN
  IF p_to_status = 'dismissed' THEN
    IF r LIKE '%known%' OR r LIKE '%catalog%' THEN RETURN 'promoted_to_known_issue'; END IF;
    IF r LIKE '%noise%' OR r LIKE '%benign%' THEN RETURN 'dismissed_as_noise'; END IF;
    IF r LIKE '%transient%' OR r LIKE '%network blip%' OR r LIKE '%cdn%' THEN RETURN 'dismissed_transient'; END IF;
    IF r LIKE '%bounce%' OR r LIKE '%suppressed%' THEN RETURN 'dismissed_email_bounce'; END IF;
    IF r LIKE '%duplicate%' THEN RETURN 'dismissed_duplicate'; END IF;
    RETURN 'dismissed_manual';
  END IF;
  IF p_to_status = 'resolved' THEN
    IF r LIKE '%recover%' OR r LIKE '%self-heal%' OR r LIKE '%retry%' OR r LIKE '%watchdog%' THEN RETURN 'auto_recovered'; END IF;
    IF r LIKE '%fix%' OR r LIKE '%patched%' OR r LIKE '%deployed%' THEN RETURN 'manual_fix_deployed'; END IF;
    RETURN 'manual_resolved';
  END IF;
  IF p_to_status = 'applied' THEN RETURN 'fix_applied'; END IF;
  IF p_to_status = 'proposed' THEN RETURN 'ai_proposed_fix'; END IF;
  IF p_to_status = 'triaged' THEN RETURN 'ai_triaged'; END IF;
  RETURN 'status_changed';
END;
$$;

-- 3. Trigger function: write an audit row on every status transition.
CREATE OR REPLACE FUNCTION public.triage_audit_log_capture()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_signal TEXT;
  v_rule TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_signal := COALESCE(
      NEW.dismissed_reason,
      NEW.proposed_fix_summary,
      NEW.root_cause_hypothesis,
      left(NEW.error_message, 500)
    );
    v_rule := public.classify_triage_rule(NEW.status, OLD.status, NEW.dismissed_reason);

    INSERT INTO public.triage_audit_log (
      fix_queue_id, fingerprint, from_status, to_status,
      rule_name, matching_signal, actor_id
    ) VALUES (
      NEW.id, NEW.fingerprint, OLD.status, NEW.status,
      v_rule, left(v_signal, 1000), v_actor
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_triage_audit_log_capture ON public.agent_fix_queue;
CREATE TRIGGER trg_triage_audit_log_capture
  AFTER UPDATE OF status ON public.agent_fix_queue
  FOR EACH ROW EXECUTE FUNCTION public.triage_audit_log_capture();

-- 4. Backfill from current state for already-closed items.
INSERT INTO public.triage_audit_log (
  fix_queue_id, fingerprint, from_status, to_status,
  rule_name, matching_signal, actor_id, created_at
)
SELECT
  q.id,
  q.fingerprint,
  NULL,
  q.status,
  public.classify_triage_rule(q.status, NULL, q.dismissed_reason),
  left(COALESCE(q.dismissed_reason, q.proposed_fix_summary, q.root_cause_hypothesis, q.error_message), 1000),
  q.dismissed_by,
  COALESCE(q.dismissed_at, q.resolved_at, q.updated_at, q.created_at)
FROM public.agent_fix_queue q
WHERE q.status IN ('dismissed','resolved','applied')
  AND NOT EXISTS (
    SELECT 1 FROM public.triage_audit_log a WHERE a.fix_queue_id = q.id
  );
