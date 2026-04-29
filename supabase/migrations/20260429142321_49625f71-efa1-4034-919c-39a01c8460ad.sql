-- OWASP A01 Broken Access Control: convert safe RPCs from elevated execution to caller-scoped execution.
-- RLS policies already provide the needed admin/self scoping for these reads.

CREATE OR REPLACE FUNCTION public.get_announcement_view_counts()
 RETURNS TABLE(announcement_id uuid, total_views bigint, unique_views bigint)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT
    announcement_id,
    count(*)::bigint AS total_views,
    count(DISTINCT user_id)::bigint AS unique_views
  FROM public.announcement_views
  GROUP BY announcement_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_top_error_fingerprints(p_hours integer DEFAULT 24, p_limit integer DEFAULT 10)
 RETURNS TABLE(fingerprint text, event_type text, table_name text, occurrences bigint, affected_users bigint, first_seen timestamp with time zone, last_seen timestamp with time zone, sample_message text)
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hours integer := LEAST(GREATEST(COALESCE(p_hours, 24), 1), 720);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
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
       AND a.created_at >= now() - make_interval(hours => v_hours)
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
   LIMIT v_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.export_my_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.write_audit_log(
    'data_export_requested',
    'profiles',
    v_uid::text,
    v_uid,
    ARRAY['full_export']
  );

  SELECT jsonb_build_object(
    'exported_at', now()::text,
    'user_id', v_uid::text,
    'profile', (SELECT row_to_json(p) FROM public.profiles p WHERE p.user_id = v_uid),
    'general_applications', COALESCE((
      SELECT jsonb_agg(row_to_json(ga))
      FROM public.general_applications ga WHERE ga.user_id = v_uid
    ), '[]'::jsonb),
    'project_applications', COALESCE((
      SELECT jsonb_agg(row_to_json(pa))
      FROM public.project_applications pa WHERE pa.user_id = v_uid
    ), '[]'::jsonb),
    'journey_progress', COALESCE((
      SELECT jsonb_agg(row_to_json(jp))
      FROM public.journey_progress jp WHERE jp.user_id = v_uid
    ), '[]'::jsonb),
    'chat_conversations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'conversation', row_to_json(cc),
        'messages', COALESCE((
          SELECT jsonb_agg(row_to_json(cm) ORDER BY cm.created_at)
          FROM public.chat_messages cm WHERE cm.conversation_id = cc.id
        ), '[]'::jsonb)
      ))
      FROM public.chat_conversations cc WHERE cc.user_id = v_uid
    ), '[]'::jsonb),
    'feedback', COALESCE((
      SELECT jsonb_agg(row_to_json(f))
      FROM public.feedback f WHERE f.user_id = v_uid
    ), '[]'::jsonb),
    'notifications', COALESCE((
      SELECT jsonb_agg(row_to_json(n))
      FROM public.notifications n WHERE n.user_id = v_uid
    ), '[]'::jsonb),
    'dashboard_preferences', (
      SELECT row_to_json(dp) FROM public.dashboard_preferences dp WHERE dp.user_id = v_uid
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

INSERT INTO public.bdd_scenarios (
  scenario_id,
  feature_area,
  feature_area_number,
  title,
  gherkin,
  status,
  test_type,
  test_file,
  notes
) VALUES (
  'SEC-INVOKER-RPCS-012',
  'Security: OWASP RPC Least Privilege',
  12,
  'Read-only and self-export RPCs execute with caller-scoped permissions',
  'Feature: OWASP A01 least-privilege RPC execution
  As a platform security reviewer
  I want safe read-only and self-export helpers to run with caller permissions
  So that database access rules remain the final enforcement layer

  Scenario: Announcement view aggregation respects caller visibility
    Given a signed-in user with announcement view access limited by database rules
    When the user requests announcement view counts
    Then the aggregation includes only rows visible to that caller

  Scenario: Error fingerprint reporting remains admin-only
    Given a signed-in non-admin user
    When the user requests top error fingerprints
    Then the database denies access
    Given a signed-in admin user
    When the admin requests top error fingerprints
    Then the database returns bounded aggregate error data

  Scenario: Personal data export remains self-scoped
    Given a signed-in user
    When the user exports their data
    Then only records owned by that user are included
    And an audit event is recorded for the export request',
  'implemented'::public.bdd_status,
  'manual'::public.bdd_test_type,
  'supabase/migrations/2026042914_invoker_rpc_least_privilege.sql',
  'Covers OWASP A01 conversion from SECURITY DEFINER to SECURITY INVOKER where RLS already enforces caller-specific access.'
) ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();