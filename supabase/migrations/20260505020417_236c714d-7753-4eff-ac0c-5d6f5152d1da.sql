-- Critical push dedup ledger: one row per (fingerprint) ever pushed.
CREATE TABLE IF NOT EXISTS public.triage_critical_push_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  fix_queue_id UUID REFERENCES public.agent_fix_queue(id) ON DELETE CASCADE,
  pushed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipients_count INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  UNIQUE (fingerprint)
);
CREATE INDEX IF NOT EXISTS triage_critical_push_log_pushed_at_idx
  ON public.triage_critical_push_log (pushed_at DESC);

ALTER TABLE public.triage_critical_push_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read critical push log"
  ON public.triage_critical_push_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
