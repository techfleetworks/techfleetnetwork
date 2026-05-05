
-- ============================================================
-- Audit Log → Failure-Only Ledger
-- ============================================================

-- ---------- PART 1: DROP chatty CRUD-mirror triggers ----------
DROP TRIGGER IF EXISTS trg_audit_announcement_reads_change ON public.announcement_reads;
DROP TRIGGER IF EXISTS trg_audit_announcement_views_change ON public.announcement_views;
DROP TRIGGER IF EXISTS trg_audit_banner_dismissals_change ON public.banner_dismissals;
DROP TRIGGER IF EXISTS trg_audit_chat_conversations_change ON public.chat_conversations;
DROP TRIGGER IF EXISTS trg_audit_chat_messages_change ON public.chat_messages;
DROP TRIGGER IF EXISTS trg_audit_dashboard_preferences_change ON public.dashboard_preferences;
DROP TRIGGER IF EXISTS trg_audit_journey_progress_change ON public.journey_progress;
DROP TRIGGER IF EXISTS trg_audit_notifications_change ON public.notifications;
DROP TRIGGER IF EXISTS trg_audit_push_subscriptions_change ON public.push_subscriptions;
DROP TRIGGER IF EXISTS trg_audit_user_quest_selections_change ON public.user_quest_selections;
DROP TRIGGER IF EXISTS trg_audit_feedback_change ON public.feedback;
DROP TRIGGER IF EXISTS trg_audit_chat_conversation ON public.chat_conversations;

-- ---------- PART 2: Narrow privileged triggers via TG_ARGV ----------
CREATE OR REPLACE FUNCTION public.audit_table_change_filtered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_allowed text[];
  v_row jsonb;
  v_old_row jsonb;
  v_record_id text;
  v_user_id uuid;
  v_changed_fields text[];
  v_event_type text;
BEGIN
  -- TG_ARGV is text[]; cast first arg (comma-separated) to array.
  v_allowed := string_to_array(COALESCE(TG_ARGV[0], ''), ',');

  v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_old_row := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_record_id := COALESCE(v_row->>'id', v_row->>'user_id');
  v_user_id := auth.uid();

  IF v_user_id IS NULL
     AND COALESCE(v_row->>'user_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_id := (v_row->>'user_id')::uuid;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(array_agg(key ORDER BY key), ARRAY[]::text[])
    INTO v_changed_fields
    FROM jsonb_each(v_row) AS n(key, value)
    WHERE n.value IS DISTINCT FROM (v_old_row -> n.key)
      AND n.key NOT IN ('updated_at', 'created_at')
      AND n.key = ANY(v_allowed);

    IF v_changed_fields IS NULL OR array_length(v_changed_fields, 1) IS NULL THEN
      RETURN NEW;
    END IF;

  ELSIF TG_OP = 'INSERT' THEN
    RETURN NEW;
  ELSE
    v_changed_fields := ARRAY['deleted'];
  END IF;

  v_event_type := TG_TABLE_NAME || '_' || lower(TG_OP);

  PERFORM public.try_write_audit_log(
    v_event_type,
    TG_TABLE_NAME,
    v_record_id,
    v_user_id,
    v_changed_fields,
    NULL::text
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_profiles_change ON public.profiles;
CREATE TRIGGER trg_audit_profiles_privileged
AFTER UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_table_change_filtered('email,membership_tier,membership_sku,discord_user_id,is_founding_member');

DROP TRIGGER IF EXISTS trg_audit_general_applications_change ON public.general_applications;
CREATE TRIGGER trg_audit_general_applications_status
AFTER UPDATE OR DELETE ON public.general_applications
FOR EACH ROW EXECUTE FUNCTION public.audit_table_change_filtered('status');

DROP TRIGGER IF EXISTS trg_audit_project_applications_change ON public.project_applications;
CREATE TRIGGER trg_audit_project_applications_status
AFTER UPDATE OR DELETE ON public.project_applications
FOR EACH ROW EXECUTE FUNCTION public.audit_table_change_filtered('status');

-- ---------- PART 3: Policy table for new Layer 1–5 error events ----------
CREATE TABLE IF NOT EXISTS public.audit_event_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type_pattern text NOT NULL UNIQUE,
  cap_per_minute integer NOT NULL DEFAULT 60,
  dedup_window_seconds integer NOT NULL DEFAULT 60,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_event_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage audit policy"
ON public.audit_event_policy
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read audit policy"
ON public.audit_event_policy
FOR SELECT TO authenticated
USING (true);

INSERT INTO public.audit_event_policy (event_type_pattern, cap_per_minute, dedup_window_seconds, notes) VALUES
  ('client_error',           10, 60,  'Client-side caught/uncaught errors'),
  ('client_error_overflow',  1,  60,  'Aggregate notice when per-tab cap suppresses'),
  ('ui_render_error',        5,  60,  'React render boundary'),
  ('ui_chunk_load_failed',   5,  300, 'Stale-chunk / lazy-load failure'),
  ('edge_function_error',    30, 30,  'withAuditWrapper uncaught edge throw'),
  ('edge_invoke_failed',     20, 30,  'Client-side edge invoke wrapper'),
  ('external_api_failed',    20, 30,  'Discord/Airtable/Gumroad/etc'),
  ('email_pipeline_unhealthy', 6, 300, 'Health check signal')
ON CONFLICT (event_type_pattern) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_audit_policy()
RETURNS TABLE(event_type_pattern text, cap_per_minute integer, dedup_window_seconds integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT event_type_pattern, cap_per_minute, dedup_window_seconds
  FROM public.audit_event_policy;
$$;

GRANT EXECUTE ON FUNCTION public.get_audit_policy() TO authenticated, anon;

-- ---------- PART 4: system_health_state.metadata ----------
ALTER TABLE public.system_health_state
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
