
CREATE OR REPLACE FUNCTION public.get_project_internal_links(p_project_id uuid)
 RETURNS TABLE(discord_role_id text, discord_role_name text, notion_repository_url text, client_intake_url text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = auth.uid();
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.project_roster pr
      WHERE pr.project_id = p_project_id
        AND v_email IS NOT NULL
        AND lower(pr.member_email) = lower(v_email)
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized for project %', p_project_id USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT p.discord_role_id, p.discord_role_name, p.notion_repository_url, p.client_intake_url
    FROM public.projects p WHERE p.id = p_project_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_project_internal_links(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_internal_links(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_community_events_health()
 RETURNS TABLE(last_refresh_status text, last_refresh_error text, fetched_at timestamp with time zone, event_count integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT c.last_refresh_status, c.last_refresh_error, c.fetched_at, c.event_count, c.updated_at
      FROM public.community_events_cache c WHERE c.id = 1;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_community_events_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_community_events_health() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_top_silent_failures(p_hours integer DEFAULT 24, p_limit integer DEFAULT 25)
 RETURNS TABLE(event_type text, table_name text, occurrences bigint, last_seen timestamp with time zone, sample_error text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT al.event_type, al.table_name, COUNT(*)::bigint AS occurrences, MAX(al.created_at) AS last_seen,
    (ARRAY_AGG(al.error_message ORDER BY al.created_at DESC) FILTER (WHERE al.error_message IS NOT NULL))[1] AS sample_error
  FROM public.audit_log al
  WHERE al.created_at >= now() - make_interval(hours => GREATEST(p_hours, 1))
    AND (al.event_type LIKE '%_failed' OR al.event_type LIKE 'client_error%'
         OR al.event_type = 'edge_function_error' OR al.event_type LIKE 'ui_%'
         OR al.event_type = 'external_api_failed'
         OR al.event_type IN ('authn_unauthorized','authz_admin_denied','authz_check_failed','malicious_webhook_signature_invalid'))
  GROUP BY al.event_type, al.table_name
  ORDER BY occurrences DESC, last_seen DESC
  LIMIT GREATEST(p_limit, 1);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_top_silent_failures(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_top_silent_failures(integer, integer) TO authenticated;

INSERT INTO public.bdd_scenarios (feature_area_number, feature_area, scenario_id, title, gherkin, status)
VALUES
(1114, 'Error Triage Queue', 'TRIAGE-FIX-001', 'Roster operational links resolve for non-admin members',
'Feature: Roster project links work for both admins and assigned members
  Scenario: Member views their assigned project
    Given a signed-in member whose email is on project_roster.member_email for project P
    When the client calls get_project_internal_links(P)
    Then [DB] the function does not raise 42703 and returns one row
    And [Code] no client_error event is emitted for source query.roster-proj-links.P
    And [UI] the My Projects detail page renders Notion and Client intake links', 'implemented'::bdd_status),
(1114, 'Error Triage Queue', 'TRIAGE-FIX-002', 'Admin Events sync banner loads',
'Feature: Admin Events sync health banner
  Scenario: Admin opens the Events page
    Given a signed-in admin
    When EventsSyncHealthBanner queries get_community_events_health
    Then [DB] the function returns the single cache health row
    And [Code] no permission_denied (42501) error is logged
    And [UI] the banner stays hidden when healthy or renders the failure alert', 'implemented'::bdd_status),
(1114, 'Error Triage Queue', 'TRIAGE-FIX-003', 'Silent Failures tab loads for admins',
'Feature: Silent Failures admin tab
  Scenario: Admin opens System Health > Silent Failures
    Given a signed-in admin
    When SilentFailuresTab calls get_top_silent_failures(24, 25)
    Then [DB] the RPC returns rows without 42501
    And [Code] errors thrown to the UI use err.message (not "[object Object]")
    And [UI] the tab renders the failure list or the empty state', 'implemented'::bdd_status)
ON CONFLICT (scenario_id) DO NOTHING;

UPDATE public.agent_fix_queue
SET status = 'resolved'
WHERE fingerprint = '93680726a485581aa90efc77d07051f54daa977a8f0e216caa98a82c28ee9758'
   OR (event_type = 'client_error' AND error_message LIKE '%column pr.user_id does not exist%')
   OR (event_type = 'client_error' AND error_message LIKE '%get_community_events_health%');
