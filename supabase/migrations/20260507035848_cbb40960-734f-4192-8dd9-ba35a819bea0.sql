
-- 1) Profile birth_year (year only — minimize PII)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_year smallint
  CHECK (birth_year IS NULL OR (birth_year BETWEEN 1900 AND EXTRACT(YEAR FROM now())::int));

-- 2) Retention enforcement
CREATE OR REPLACE FUNCTION public.enforce_retention_policy()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purged_ledger int := 0;
  v_anon_vitals int := 0;
  v_anon_network int := 0;
  v_anon_unsub int := 0;
  v_summary jsonb;
BEGIN
  -- (a) 24-month ledger purge: drop ledger rows whose dispute window expired
  WITH purged AS (
    DELETE FROM public.deleted_users_ledger
    WHERE purge_after < now()
    RETURNING 1
  )
  SELECT count(*) INTO v_purged_ledger FROM purged;

  -- (b) anonymize web vitals > 25 months
  IF to_regclass('public.web_vital_samples') IS NOT NULL THEN
    EXECUTE $sql$
      WITH upd AS (
        UPDATE public.web_vital_samples
        SET user_id = NULL
        WHERE user_id IS NOT NULL AND created_at < now() - interval '25 months'
        RETURNING 1
      ) SELECT count(*) FROM upd
    $sql$ INTO v_anon_vitals;
  END IF;

  -- network_activity actor anonymize
  IF to_regclass('public.network_activity') IS NOT NULL THEN
    EXECUTE $sql$
      WITH upd AS (
        UPDATE public.network_activity
        SET actor_id = NULL
        WHERE actor_id IS NOT NULL AND created_at < now() - interval '25 months'
        RETURNING 1
      ) SELECT count(*) FROM upd
    $sql$ INTO v_anon_network;
  END IF;

  -- (c) unsubscribe list: anonymize emails > 5 years
  IF to_regclass('public.email_unsubscribes') IS NOT NULL THEN
    EXECUTE $sql$
      WITH upd AS (
        UPDATE public.email_unsubscribes
        SET email = 'redacted+' || encode(digest(email,'sha256'),'hex') || '@redacted.invalid'
        WHERE email NOT LIKE 'redacted+%' AND created_at < now() - interval '5 years'
        RETURNING 1
      ) SELECT count(*) FROM upd
    $sql$ INTO v_anon_unsub;
  END IF;

  v_summary := jsonb_build_object(
    'purged_ledger_rows', v_purged_ledger,
    'anonymized_web_vitals', v_anon_vitals,
    'anonymized_network_activity', v_anon_network,
    'anonymized_email_unsubscribes', v_anon_unsub,
    'ran_at', now()
  );

  -- Best-effort audit trail
  BEGIN
    INSERT INTO public.audit_log(event_type, actor_id, target_type, target_id, payload)
    VALUES ('retention_policy_run', NULL, 'system', NULL, v_summary);
  EXCEPTION WHEN OTHERS THEN
    -- audit_log shape may differ; never block retention run
    NULL;
  END;

  RETURN v_summary;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_retention_policy() FROM PUBLIC, anon, authenticated;

-- 3) Open an incident (admin only)
CREATE OR REPLACE FUNCTION public.open_incident(
  _severity public.incident_severity,
  _title text,
  _description text,
  _affected_user_count int DEFAULT 0,
  _jurisdictions text[] DEFAULT ARRAY[]::text[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.incident_response(
    opened_by, severity, title, description, affected_user_count, jurisdictions,
    draft_regulator_notice, draft_user_notice
  )
  VALUES (
    auth.uid(), _severity, _title, _description, _affected_user_count, COALESCE(_jurisdictions, ARRAY[]::text[]),
    'DRAFT — Regulator Notification' || E'\n\nIncident: ' || _title || E'\n\nSummary: ' || _description ||
      E'\n\nAffected individuals: ' || _affected_user_count::text ||
      E'\n\nJurisdictions: ' || array_to_string(COALESCE(_jurisdictions, ARRAY[]::text[]), ', '),
    'DRAFT — User Notification' || E'\n\nWe are writing to inform you of a security incident affecting your data. ' ||
      E'\n\nDetails: ' || _description ||
      E'\n\nWhat we are doing: We have launched an investigation and are taking steps to contain the issue.'
  )
  RETURNING id INTO v_id;

  BEGIN
    INSERT INTO public.audit_log(event_type, actor_id, target_type, target_id, payload)
    VALUES ('incident_opened', auth.uid(), 'incident_response', v_id,
      jsonb_build_object('severity', _severity, 'affected', _affected_user_count));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_incident(public.incident_severity, text, text, int, text[]) TO authenticated;

-- 4) Request human review of an automated decision (any signed-in user)
CREATE OR REPLACE FUNCTION public.request_human_review(
  _surface text,
  _context jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE user_id = auth.uid();
  IF v_email IS NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  END IF;

  INSERT INTO public.dsar_requests(user_id, requester_email, type, payload)
  VALUES (auth.uid(), COALESCE(v_email, 'unknown@unknown.invalid'), 'human_review',
          jsonb_build_object('surface', _surface, 'context', _context))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_human_review(text, jsonb) TO authenticated;

-- 5) Daily cron at 03:10 UTC for retention
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'enforce_retention_policy_daily';
    PERFORM cron.schedule(
      'enforce_retention_policy_daily',
      '10 3 * * *',
      $cron$ SELECT public.enforce_retention_policy(); $cron$
    );
  END IF;
END $$;
