
-- ============================================================
-- Project Blasts: admin-only, coordinator-scoped, append-only
-- ============================================================

CREATE TABLE IF NOT EXISTS public.project_blasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  audience_filter jsonb NOT NULL DEFAULT '{"statuses":["completed"]}'::jsonb,
  recipient_count integer NOT NULL DEFAULT 0,
  email_sent_count integer NOT NULL DEFAULT 0,
  email_failed_count integer NOT NULL DEFAULT 0,
  email_suppressed_count integer NOT NULL DEFAULT 0,
  notification_sent_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT project_blasts_subject_len CHECK (char_length(subject) BETWEEN 1 AND 150),
  CONSTRAINT project_blasts_body_len CHECK (char_length(body_html) <= 50000),
  CONSTRAINT project_blasts_status_chk CHECK (status IN ('queued','sending','sent','partial','failed'))
);

CREATE INDEX IF NOT EXISTS idx_project_blasts_project_created
  ON public.project_blasts(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_blasts_sender_created
  ON public.project_blasts(sender_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.project_blast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blast_id uuid NOT NULL REFERENCES public.project_blasts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  email_hash text NOT NULL,
  email_status text NOT NULL DEFAULT 'queued',
  email_message_id text,
  notification_id uuid,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_blast_recipients_unique UNIQUE (blast_id, user_id),
  CONSTRAINT project_blast_recipients_status_chk
    CHECK (email_status IN ('queued','sent','failed','suppressed'))
);

CREATE INDEX IF NOT EXISTS idx_project_blast_recipients_blast
  ON public.project_blast_recipients(blast_id);
CREATE INDEX IF NOT EXISTS idx_project_blast_recipients_message
  ON public.project_blast_recipients(email_message_id);

-- Sanitize body before insert/update (defense in depth — edge fn also sanitizes)
CREATE OR REPLACE FUNCTION public.sanitize_project_blast_body()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  NEW.body_html := public.sanitize_user_html(NEW.body_html);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_blasts_sanitize ON public.project_blasts;
CREATE TRIGGER trg_project_blasts_sanitize
  BEFORE INSERT OR UPDATE OF body_html ON public.project_blasts
  FOR EACH ROW EXECUTE FUNCTION public.sanitize_project_blast_body();

-- RLS: deny-by-default, admin + coordinator can SELECT, no UPDATE/DELETE policies
ALTER TABLE public.project_blasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_blasts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.project_blast_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_blast_recipients FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blasts_admin_coord_select" ON public.project_blasts;
CREATE POLICY "blasts_admin_coord_select"
  ON public.project_blasts FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_blasts.project_id
        AND p.coordinator_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "blast_recipients_admin_coord_select" ON public.project_blast_recipients;
CREATE POLICY "blast_recipients_admin_coord_select"
  ON public.project_blast_recipients FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_blasts b
      JOIN public.projects p ON p.id = b.project_id
      WHERE b.id = project_blast_recipients.blast_id
        AND public.has_role(auth.uid(), 'admin'::app_role)
        AND p.coordinator_id = auth.uid()
    )
  );

-- ============================================================
-- get_project_blast_health(window_days int) — admin-only RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_project_blast_health(window_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_since timestamptz;
  v_totals jsonb;
  v_recent jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  window_days := GREATEST(1, LEAST(COALESCE(window_days, 30), 365));
  v_since := now() - make_interval(days => window_days);

  SELECT jsonb_build_object(
    'window_days', window_days,
    'total_blasts', COUNT(*),
    'total_recipients', COALESCE(SUM(recipient_count), 0),
    'total_sent', COALESCE(SUM(email_sent_count), 0),
    'total_failed', COALESCE(SUM(email_failed_count), 0),
    'total_suppressed', COALESCE(SUM(email_suppressed_count), 0),
    'success_rate', CASE
      WHEN COALESCE(SUM(recipient_count),0) = 0 THEN 0
      ELSE round((COALESCE(SUM(email_sent_count),0)::numeric
                  / NULLIF(SUM(recipient_count),0)) * 100, 1)
    END
  )
  INTO v_totals
  FROM public.project_blasts
  WHERE created_at >= v_since;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT b.id, b.project_id, b.subject, b.status,
           b.recipient_count, b.email_sent_count, b.email_failed_count,
           b.email_suppressed_count, b.notification_sent_count,
           b.created_at, b.sent_at,
           p.friendly_name AS project_friendly_name,
           c.name AS client_name,
           coalesce(prof.first_name || ' ' || prof.last_name, prof.email) AS sender_name
    FROM public.project_blasts b
    LEFT JOIN public.projects p ON p.id = b.project_id
    LEFT JOIN public.clients c ON c.id = p.client_id
    LEFT JOIN public.profiles prof ON prof.id = b.sender_id
    WHERE b.created_at >= v_since
    ORDER BY b.created_at DESC
    LIMIT 25
  ) r;

  RETURN jsonb_build_object('totals', v_totals, 'recent', v_recent, 'generated_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.get_project_blast_health(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_blast_health(integer) TO authenticated;

-- Realtime for live blast progress
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_blasts;
