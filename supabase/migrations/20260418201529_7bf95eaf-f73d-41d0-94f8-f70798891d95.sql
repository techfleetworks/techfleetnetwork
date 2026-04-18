-- =====================================================================
-- SELF-HEALING SYSTEM: error fingerprinting, remediation registry,
-- discord role retry queue, and system health gauge
-- =====================================================================

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS error_fingerprint text;

CREATE OR REPLACE FUNCTION public.compute_error_fingerprint(p_event text, p_table text, p_msg text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  normalized text;
BEGIN
  IF p_msg IS NULL OR length(trim(p_msg)) = 0 THEN
    RETURN encode(sha256(convert_to(coalesce(p_event,'') || '|' || coalesce(p_table,''), 'UTF8')), 'hex');
  END IF;
  normalized := lower(p_msg);
  normalized := regexp_replace(normalized, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'UUID', 'g');
  normalized := regexp_replace(normalized, '\d{4,}', 'N', 'g');
  normalized := regexp_replace(normalized, '"[^"]{0,200}"', '"S"', 'g');
  normalized := regexp_replace(normalized, '''[^'']{0,200}''', '''S''', 'g');
  normalized := regexp_replace(normalized, '\s+', ' ', 'g');
  normalized := substring(normalized from 1 for 500);
  RETURN encode(sha256(convert_to(coalesce(p_event,'') || '|' || coalesce(p_table,'') || '|' || normalized, 'UTF8')), 'hex');
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_log_set_fingerprint()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.error_fingerprint IS NULL THEN
    NEW.error_fingerprint := public.compute_error_fingerprint(NEW.event_type, NEW.table_name, NEW.error_message);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_fingerprint ON public.audit_log;
CREATE TRIGGER trg_audit_log_fingerprint
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_log_set_fingerprint();

CREATE INDEX IF NOT EXISTS idx_audit_log_fingerprint_created
  ON public.audit_log (error_fingerprint, created_at DESC)
  WHERE error_message IS NOT NULL;

UPDATE public.audit_log
   SET error_fingerprint = public.compute_error_fingerprint(event_type, table_name, error_message)
 WHERE error_fingerprint IS NULL
   AND created_at > now() - interval '30 days';

CREATE OR REPLACE FUNCTION public.get_top_error_fingerprints(
  p_hours integer DEFAULT 24,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  fingerprint text,
  event_type text,
  table_name text,
  occurrences bigint,
  affected_users bigint,
  first_seen timestamptz,
  last_seen timestamptz,
  sample_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH windowed AS (
    SELECT a.error_fingerprint, a.event_type, a.table_name, a.user_id, a.error_message, a.created_at
      FROM public.audit_log a
     WHERE a.error_message IS NOT NULL
       AND a.error_fingerprint IS NOT NULL
       AND a.created_at >= now() - make_interval(hours => GREATEST(p_hours, 1))
  )
  SELECT w.error_fingerprint,
         (array_agg(w.event_type ORDER BY w.created_at DESC))[1] AS event_type,
         (array_agg(w.table_name ORDER BY w.created_at DESC))[1] AS table_name,
         count(*)::bigint AS occurrences,
         count(DISTINCT w.user_id)::bigint AS affected_users,
         min(w.created_at) AS first_seen,
         max(w.created_at) AS last_seen,
         (array_agg(w.error_message ORDER BY w.created_at DESC))[1] AS sample_message
    FROM windowed w
   GROUP BY w.error_fingerprint
   ORDER BY occurrences DESC
   LIMIT GREATEST(p_limit, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.get_top_error_fingerprints(integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_top_error_fingerprints(integer, integer) TO authenticated;

-- ── system health gauge ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_health_state (
  id integer PRIMARY KEY DEFAULT 1,
  status text NOT NULL DEFAULT 'healthy'
    CHECK (status IN ('healthy','degraded','overloaded')),
  reason text NOT NULL DEFAULT '',
  pause_non_critical boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_health_singleton CHECK (id = 1)
);

INSERT INTO public.system_health_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.system_health_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_health_read_admin" ON public.system_health_state;
CREATE POLICY "system_health_read_admin"
  ON public.system_health_state FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.evaluate_system_health()
RETURNS public.system_health_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_errors bigint;
  fanout_backlog bigint;
  outbox_backlog bigint;
  next_status text := 'healthy';
  next_reason text := 'All systems nominal';
  next_pause boolean := false;
  result public.system_health_state;
BEGIN
  SELECT count(*) INTO recent_errors
    FROM public.audit_log
   WHERE error_message IS NOT NULL
     AND created_at >= now() - interval '5 minutes';

  SELECT count(*) INTO fanout_backlog
    FROM public.notification_fanout_jobs
   WHERE status IN ('pending','running')
     AND created_at < now() - interval '10 minutes';

  SELECT count(*) INTO outbox_backlog
    FROM public.notification_outbox
   WHERE delivered_at IS NULL
     AND attempts >= 3;

  IF recent_errors > 100 OR fanout_backlog > 50 OR outbox_backlog > 200 THEN
    next_status := 'overloaded';
    next_pause := true;
    next_reason := format(
      'Overloaded: %s errors/5min, %s stuck fanout jobs, %s stuck outbox rows',
      recent_errors, fanout_backlog, outbox_backlog
    );
  ELSIF recent_errors > 25 OR fanout_backlog > 10 OR outbox_backlog > 50 THEN
    next_status := 'degraded';
    next_reason := format(
      'Degraded: %s errors/5min, %s slow fanout, %s slow outbox',
      recent_errors, fanout_backlog, outbox_backlog
    );
  END IF;

  UPDATE public.system_health_state
     SET status = next_status,
         reason = next_reason,
         pause_non_critical = next_pause,
         updated_at = now()
   WHERE id = 1
   RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_system_health() FROM public;
GRANT EXECUTE ON FUNCTION public.evaluate_system_health() TO authenticated;

-- ── auto-remediation registry ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_remediations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_pattern text NOT NULL,
  event_type_filter text,
  remediation_function text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  cooldown_seconds integer NOT NULL DEFAULT 300,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  run_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_remediations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_remediations_admin_read" ON public.system_remediations;
CREATE POLICY "system_remediations_admin_read"
  ON public.system_remediations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "system_remediations_admin_write" ON public.system_remediations;
CREATE POLICY "system_remediations_admin_write"
  ON public.system_remediations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.is_remediation_allowed(p_fn text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_fn = ANY (ARRAY[
    'cleanup_stuck_email_queue',
    'cleanup_rate_limits',
    'cleanup_passkey_login_artifacts',
    'drain_notification_outbox',
    'retry_stuck_fanout_jobs',
    'retry_pending_discord_role_grants',
    'evaluate_system_health'
  ]);
$$;

CREATE OR REPLACE FUNCTION public.run_auto_remediations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rule public.system_remediations%ROWTYPE;
  matched_count bigint;
  ran integer := 0;
  results jsonb := '[]'::jsonb;
  fn_status text;
  fn_error text;
BEGIN
  FOR rule IN
    SELECT * FROM public.system_remediations
     WHERE enabled = true
       AND (last_run_at IS NULL OR last_run_at < now() - make_interval(secs => cooldown_seconds))
  LOOP
    IF NOT public.is_remediation_allowed(rule.remediation_function) THEN
      UPDATE public.system_remediations
         SET last_status = 'blocked',
             last_error = 'function not in allowlist',
             updated_at = now()
       WHERE id = rule.id;
      CONTINUE;
    END IF;

    EXECUTE
      'SELECT count(*) FROM public.audit_log
        WHERE error_message IS NOT NULL
          AND created_at >= now() - interval ''15 minutes''
          AND ($1 IS NULL OR event_type = $1)
          AND error_message ~ $2'
    INTO matched_count
    USING rule.event_type_filter, rule.signature_pattern;

    IF matched_count = 0 THEN
      CONTINUE;
    END IF;

    fn_status := 'success';
    fn_error := NULL;
    BEGIN
      EXECUTE format('SELECT public.%I()', rule.remediation_function);
    EXCEPTION WHEN OTHERS THEN
      fn_status := 'error';
      fn_error := SQLERRM;
    END;

    UPDATE public.system_remediations
       SET last_run_at = now(),
           last_status = fn_status,
           last_error = fn_error,
           run_count = run_count + 1,
           success_count = success_count + CASE WHEN fn_status = 'success' THEN 1 ELSE 0 END,
           updated_at = now()
     WHERE id = rule.id;

    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, error_message, changed_fields)
    VALUES (
      'auto_remediation_run',
      'system_remediations',
      rule.id::text,
      NULL,
      CASE WHEN fn_status = 'error' THEN fn_error ELSE NULL END,
      ARRAY[
        'function:' || rule.remediation_function,
        'status:' || fn_status,
        'matched:' || matched_count::text
      ]
    );

    ran := ran + 1;
    results := results || jsonb_build_object(
      'rule_id', rule.id,
      'function', rule.remediation_function,
      'status', fn_status,
      'matched', matched_count,
      'error', fn_error
    );
  END LOOP;

  RETURN jsonb_build_object('ran', ran, 'results', results);
END;
$$;

REVOKE ALL ON FUNCTION public.run_auto_remediations() FROM public;
GRANT EXECUTE ON FUNCTION public.run_auto_remediations() TO authenticated;

CREATE OR REPLACE FUNCTION public.retry_stuck_fanout_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reset_count integer;
BEGIN
  UPDATE public.notification_fanout_jobs
     SET status = 'pending',
         started_at = NULL,
         updated_at = now(),
         attempts = attempts + 1,
         last_error = coalesce(last_error,'') || ' | auto-retry by remediation'
   WHERE status = 'running'
     AND started_at < now() - interval '15 minutes'
     AND attempts < 5;
  GET DIAGNOSTICS reset_count = ROW_COUNT;

  UPDATE public.notification_fanout_jobs
     SET status = 'failed',
         finished_at = now(),
         updated_at = now()
   WHERE status IN ('running','pending')
     AND attempts >= 5
     AND created_at < now() - interval '1 hour';

  RETURN reset_count;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_stuck_fanout_jobs() FROM public;
GRANT EXECUTE ON FUNCTION public.retry_stuck_fanout_jobs() TO authenticated;

-- ── discord role grant retry queue ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.discord_role_grant_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  discord_user_id text NOT NULL,
  role_id text NOT NULL,
  reason text NOT NULL DEFAULT '',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  granted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discord_user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_drg_pending
  ON public.discord_role_grant_queue (next_attempt_at)
  WHERE granted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_drg_user
  ON public.discord_role_grant_queue (user_id)
  WHERE granted_at IS NULL;

ALTER TABLE public.discord_role_grant_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drg_admin_read" ON public.discord_role_grant_queue;
CREATE POLICY "drg_admin_read"
  ON public.discord_role_grant_queue FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR user_id = auth.uid());

DROP POLICY IF EXISTS "drg_admin_write" ON public.discord_role_grant_queue;
CREATE POLICY "drg_admin_write"
  ON public.discord_role_grant_queue FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.queue_discord_role_grant(
  p_user_id uuid,
  p_discord_user_id text,
  p_role_id text,
  p_reason text DEFAULT '',
  p_error text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec_id uuid;
BEGIN
  IF p_discord_user_id IS NULL OR p_role_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.discord_role_grant_queue (
    user_id, discord_user_id, role_id, reason, last_error, next_attempt_at
  )
  VALUES (
    p_user_id, p_discord_user_id, p_role_id, coalesce(p_reason,''), p_error,
    now() + interval '30 seconds'
  )
  ON CONFLICT (discord_user_id, role_id) DO UPDATE
    SET attempts = public.discord_role_grant_queue.attempts + 1,
        last_error = COALESCE(EXCLUDED.last_error, public.discord_role_grant_queue.last_error),
        next_attempt_at = now() + (interval '30 seconds' * power(2, LEAST(public.discord_role_grant_queue.attempts, 6))),
        granted_at = NULL,
        updated_at = now()
  RETURNING id INTO rec_id;

  RETURN rec_id;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_discord_role_grant(uuid, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.queue_discord_role_grant(uuid, text, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.retry_pending_discord_role_grants()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaned integer;
BEGIN
  DELETE FROM public.discord_role_grant_queue
   WHERE granted_at IS NOT NULL
     AND granted_at < now() - interval '1 day';
  GET DIAGNOSTICS cleaned = ROW_COUNT;

  UPDATE public.discord_role_grant_queue
     SET last_error = coalesce(last_error,'') || ' | exhausted',
         next_attempt_at = now() + interval '7 days'
   WHERE granted_at IS NULL
     AND attempts >= 8;

  RETURN cleaned;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_pending_discord_role_grants() FROM public;
GRANT EXECUTE ON FUNCTION public.retry_pending_discord_role_grants() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_pending_role_grants_for_user(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  discord_user_id text,
  role_id text,
  attempts integer
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id, discord_user_id, role_id, attempts
    FROM public.discord_role_grant_queue
   WHERE user_id = p_user_id
     AND granted_at IS NULL
     AND next_attempt_at <= now()
   ORDER BY next_attempt_at ASC
   LIMIT 5;
$$;

REVOKE ALL ON FUNCTION public.list_pending_role_grants_for_user(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.list_pending_role_grants_for_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_discord_role_grant_result(
  p_id uuid,
  p_success boolean,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_success THEN
    UPDATE public.discord_role_grant_queue
       SET granted_at = now(),
           last_error = NULL,
           updated_at = now()
     WHERE id = p_id;
  ELSE
    UPDATE public.discord_role_grant_queue
       SET attempts = attempts + 1,
           last_error = p_error,
           next_attempt_at = now() + (interval '30 seconds' * power(2, LEAST(attempts, 6))),
           updated_at = now()
     WHERE id = p_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_discord_role_grant_result(uuid, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_discord_role_grant_result(uuid, boolean, text) TO authenticated, service_role;

INSERT INTO public.system_remediations (signature_pattern, event_type_filter, remediation_function, description, cooldown_seconds)
VALUES
  ('stuck|stale|timeout', 'email_send_failure', 'cleanup_stuck_email_queue', 'Auto-DLQ stuck pgmq email messages', 300),
  ('rate.?limit|429', NULL, 'cleanup_rate_limits', 'Purge expired rate-limit windows', 600),
  ('outbox|notification.*pending', NULL, 'drain_notification_outbox', 'Drain pending notification outbox', 60),
  ('fanout|notification_fanout', NULL, 'retry_stuck_fanout_jobs', 'Retry stuck fanout jobs', 300),
  ('discord.*role|role.*grant.*fail', NULL, 'retry_pending_discord_role_grants', 'Cleanup pending Discord role grants', 300),
  ('passkey.*challenge|webauthn', NULL, 'cleanup_passkey_login_artifacts', 'Purge stale passkey artifacts', 600)
ON CONFLICT DO NOTHING;

DO $$
DECLARE has_cron boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) INTO has_cron;

  IF has_cron THEN
    PERFORM cron.unschedule(jobname) FROM cron.job
     WHERE jobname IN ('self_healing_remediations', 'self_healing_health_eval');

    PERFORM cron.schedule(
      'self_healing_remediations',
      '*/2 * * * *',
      $cmd$ SELECT public.run_auto_remediations(); $cmd$
    );
    PERFORM cron.schedule(
      'self_healing_health_eval',
      '*/1 * * * *',
      $cmd$ SELECT public.evaluate_system_health(); $cmd$
    );
  END IF;
END;
$$;