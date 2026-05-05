
-- ============================================================================
-- Error Triage Queue: agent_fix_queue + agent_triage_budget
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_fix_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  error_message TEXT NOT NULL,
  sample_trace_id TEXT,
  severity TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('info','warn','error')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','triaged','proposed','applied','dismissed','resolved')),
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  root_cause_hypothesis TEXT,
  proposed_fix_summary TEXT,
  proposed_fix_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  triage_model TEXT,
  triage_tokens_in INTEGER,
  triage_tokens_out INTEGER,
  triage_cost_estimate_usd NUMERIC(10,6),
  triaged_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  dismissed_reason TEXT,
  dismissed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_fix_queue_status_last_seen
  ON public.agent_fix_queue (status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_fix_queue_severity
  ON public.agent_fix_queue (severity, last_seen_at DESC);

ALTER TABLE public.agent_fix_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view fix queue"
  ON public.agent_fix_queue FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update fix queue"
  ON public.agent_fix_queue FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- No INSERT/DELETE policies for authenticated users — only SECURITY DEFINER
-- functions (called by the triage edge function) may write.

CREATE TRIGGER trg_agent_fix_queue_updated_at
  BEFORE UPDATE ON public.agent_fix_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Daily AI-call budget (single-row, hard cap 20/day enforced in edge fn)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_triage_budget (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  triage_calls_used INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.agent_triage_budget (id, day, triage_calls_used)
VALUES (1, CURRENT_DATE, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.agent_triage_budget ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view triage budget"
  ON public.agent_triage_budget FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ----------------------------------------------------------------------------
-- Helper RPCs (SECURITY DEFINER)
-- ----------------------------------------------------------------------------

-- Upsert a fix-queue entry: insert if new fingerprint, otherwise bump counts.
CREATE OR REPLACE FUNCTION public.upsert_fix_queue_entry(
  p_fingerprint TEXT,
  p_event_type TEXT,
  p_source TEXT,
  p_error_message TEXT,
  p_severity TEXT DEFAULT 'error',
  p_sample_trace_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        -- Reopen if it was previously resolved and is now happening again.
        status = CASE
          WHEN public.agent_fix_queue.status IN ('resolved','dismissed')
            THEN 'pending'
          ELSE public.agent_fix_queue.status
        END,
        sample_trace_id = COALESCE(EXCLUDED.sample_trace_id, public.agent_fix_queue.sample_trace_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_fix_queue_entry(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;

-- Atomic budget claim. Returns true if the call is allowed (and increments),
-- false if the daily cap (20) is already reached.
CREATE OR REPLACE FUNCTION public.claim_triage_budget(p_cap INTEGER DEFAULT 20)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used INTEGER;
BEGIN
  -- Roll the day if needed.
  UPDATE public.agent_triage_budget
     SET day = CURRENT_DATE,
         triage_calls_used = 0,
         updated_at = now()
   WHERE id = 1 AND day <> CURRENT_DATE;

  -- Try to increment if under cap.
  UPDATE public.agent_triage_budget
     SET triage_calls_used = triage_calls_used + 1,
         updated_at = now()
   WHERE id = 1 AND triage_calls_used < p_cap
   RETURNING triage_calls_used INTO v_used;

  RETURN v_used IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_triage_budget(INTEGER) FROM PUBLIC, anon, authenticated;

-- Admin-only state transition with light auditing into audit_log.
CREATE OR REPLACE FUNCTION public.set_fix_queue_status(
  p_id UUID,
  p_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_status NOT IN ('pending','triaged','proposed','applied','dismissed','resolved') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  UPDATE public.agent_fix_queue
     SET status = p_status,
         applied_at  = CASE WHEN p_status = 'applied'  THEN now() ELSE applied_at  END,
         resolved_at = CASE WHEN p_status = 'resolved' THEN now() ELSE resolved_at END,
         dismissed_at = CASE WHEN p_status = 'dismissed' THEN now() ELSE dismissed_at END,
         dismissed_by = CASE WHEN p_status = 'dismissed' THEN v_actor ELSE dismissed_by END,
         dismissed_reason = CASE WHEN p_status = 'dismissed' THEN p_reason ELSE dismissed_reason END
   WHERE id = p_id;

  -- Light audit row — privileged admin action, low volume.
  PERFORM public.write_audit_log(
    p_event_type := 'fix_queue_status_changed',
    p_table_name := 'agent_fix_queue',
    p_record_id  := p_id::text,
    p_user_id    := v_actor,
    p_error_message := NULL,
    p_changed_fields := ARRAY['status:' || p_status]
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_fix_queue_status(UUID,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_fix_queue_status(UUID,TEXT,TEXT) TO authenticated;
