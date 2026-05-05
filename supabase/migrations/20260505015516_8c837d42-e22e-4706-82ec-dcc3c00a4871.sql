
-- =========================================================================
-- known_issue_catalog : silence list, editable from UI (no deploy required)
-- =========================================================================
CREATE TABLE public.known_issue_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern TEXT NOT NULL,
  match_kind TEXT NOT NULL DEFAULT 'substring' CHECK (match_kind IN ('substring','regex','fingerprint')),
  event_type_filter TEXT,
  reason TEXT NOT NULL,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pattern, match_kind, event_type_filter)
);

ALTER TABLE public.known_issue_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read known_issue_catalog"
  ON public.known_issue_catalog FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins write known_issue_catalog"
  ON public.known_issue_catalog FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_kic_updated_at
  BEFORE UPDATE ON public.known_issue_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_kic_active ON public.known_issue_catalog (is_active) WHERE is_active;

-- Seed from existing SUPPRESSED_PATTERNS in error-reporter.service.ts
INSERT INTO public.known_issue_catalog (pattern, match_kind, reason) VALUES
  ('Lock broken by another request', 'substring', 'Browser ServiceWorker lock contention; benign'),
  ('newestWorker is null', 'substring', 'ServiceWorker race; benign'),
  ('Failed to update a ServiceWorker', 'substring', 'PWA SW disabled; benign'),
  ('An unknown error occurred when fetching the script', 'substring', 'Browser-side script fetch noise'),
  ('Extension context invalidated', 'substring', 'Browser extension noise; not our code'),
  ('Refused to evaluate a string as JavaScript', 'substring', 'CSP blocking eval; intentional'),
  ('at predicate (eval at evaluate', 'substring', 'Third-party eval noise'),
  ('ResizeObserver loop completed with undelivered notifications', 'substring', 'Benign browser warning'),
  ('ResizeObserver loop limit exceeded', 'substring', 'Benign browser warning')
ON CONFLICT (pattern, match_kind, event_type_filter) DO NOTHING;

-- =========================================================================
-- error_digest_log : one row per daily digest, dedup by digest_key
-- =========================================================================
CREATE TABLE public.error_digest_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_key TEXT NOT NULL UNIQUE,            -- e.g. 'daily-2026-05-05'
  channel TEXT NOT NULL CHECK (channel IN ('email','discord','push')),
  recipient TEXT NOT NULL,
  pending_count INTEGER NOT NULL DEFAULT 0,
  proposed_count INTEGER NOT NULL DEFAULT 0,
  audit_pressure TEXT,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (digest_key, channel, recipient)
);

ALTER TABLE public.error_digest_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read error_digest_log"
  ON public.error_digest_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_edl_delivered ON public.error_digest_log (delivered_at DESC);

-- =========================================================================
-- discover_audit_fingerprints
--   Sweeps audit_log for error-bearing rows in the last 24h, dedups by
--   fingerprint, skips known_issue_catalog matches, and upserts into
--   agent_fix_queue.  Idempotent.  Returns count of inserted/updated rows.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.discover_audit_fingerprints(p_min_occurrences INT DEFAULT 1)
RETURNS TABLE(processed INT, queued INT, silenced INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed INT := 0;
  v_queued INT := 0;
  v_silenced INT := 0;
  r RECORD;
  v_silence BOOLEAN;
BEGIN
  FOR r IN
    SELECT
      error_fingerprint AS fingerprint,
      max(event_type) AS event_type,
      max(table_name) AS source,
      (array_agg(error_message ORDER BY created_at DESC))[1] AS sample_message,
      count(*)::int AS occ,
      min(created_at) AS first_seen,
      max(created_at) AS last_seen
    FROM public.audit_log
    WHERE error_message IS NOT NULL
      AND error_fingerprint IS NOT NULL
      AND created_at > now() - interval '24 hours'
    GROUP BY error_fingerprint
    HAVING count(*) >= p_min_occurrences
  LOOP
    v_processed := v_processed + 1;

    -- Silenced?  (substring or fingerprint match, optional event_type filter)
    SELECT EXISTS (
      SELECT 1 FROM public.known_issue_catalog k
      WHERE k.is_active
        AND (k.expires_at IS NULL OR k.expires_at > now())
        AND (k.event_type_filter IS NULL OR k.event_type_filter = r.event_type)
        AND (
          (k.match_kind = 'substring'   AND r.sample_message ILIKE '%' || k.pattern || '%') OR
          (k.match_kind = 'fingerprint' AND r.fingerprint = k.pattern) OR
          (k.match_kind = 'regex'       AND r.sample_message ~ k.pattern)
        )
    ) INTO v_silence;

    IF v_silence THEN
      v_silenced := v_silenced + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.agent_fix_queue
      (fingerprint, event_type, source, error_message, severity,
       status, occurrence_count, first_seen_at, last_seen_at)
    VALUES
      (r.fingerprint, r.event_type, r.source, left(r.sample_message, 4000),
       'error', 'pending', r.occ, r.first_seen, r.last_seen)
    ON CONFLICT (fingerprint) DO UPDATE
      SET occurrence_count = GREATEST(agent_fix_queue.occurrence_count, EXCLUDED.occurrence_count),
          last_seen_at     = GREATEST(agent_fix_queue.last_seen_at, EXCLUDED.last_seen_at),
          error_message    = COALESCE(NULLIF(agent_fix_queue.error_message,''), EXCLUDED.error_message),
          updated_at       = now()
      WHERE agent_fix_queue.status IN ('pending','triaged','proposed');

    v_queued := v_queued + 1;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_queued, v_silenced;
END;
$$;

REVOKE ALL ON FUNCTION public.discover_audit_fingerprints(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discover_audit_fingerprints(INT) TO service_role;

-- Triage state lookup for Activity Log chips (admin only via RLS on agent_fix_queue)
CREATE OR REPLACE VIEW public.audit_triage_state AS
SELECT a.id AS audit_id,
       a.error_fingerprint,
       q.status AS triage_status,
       q.id AS fix_queue_id,
       CASE
         WHEN EXISTS (SELECT 1 FROM public.known_issue_catalog k
                       WHERE k.is_active
                         AND (k.expires_at IS NULL OR k.expires_at > now())
                         AND ((k.match_kind='substring'   AND a.error_message ILIKE '%'||k.pattern||'%') OR
                              (k.match_kind='fingerprint' AND a.error_fingerprint = k.pattern)))
         THEN 'silenced'
         ELSE NULL
       END AS silence_state
FROM public.audit_log a
LEFT JOIN public.agent_fix_queue q ON q.fingerprint = a.error_fingerprint
WHERE a.error_fingerprint IS NOT NULL;
