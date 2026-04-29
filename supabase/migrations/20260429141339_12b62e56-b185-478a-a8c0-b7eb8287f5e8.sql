-- OWASP A01 hardening: self-scoped SECURITY DEFINER helpers must not disclose other users' state.

CREATE OR REPLACE FUNCTION public.admin_2fa_grace_deadline(_user_id uuid)
RETURNS timestamp with time zone
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed boolean;
  v_deadline timestamptz;
BEGIN
  v_allowed := auth.role() = 'service_role'
    OR auth.uid() = _user_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role);

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(
    (
      SELECT GREATEST(MIN(created_at), TIMESTAMPTZ '2026-04-28 00:00:00+00') + interval '5 days'
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = 'admin'::public.app_role
    ),
    TIMESTAMPTZ '2026-04-28 00:00:00+00' + interval '5 days'
  ) INTO v_deadline;

  RETURN v_deadline;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_2fa_grace_active(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN now() < public.admin_2fa_grace_deadline(_user_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_own_promotions(p_user_id uuid)
RETURNS TABLE(id uuid, user_id uuid, promoted_by uuid, created_at timestamp with time zone, confirmed_at timestamp with time zone)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role'
     AND auth.uid() <> p_user_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT ap.id, ap.user_id, ap.promoted_by, ap.created_at, ap.confirmed_at
  FROM public.admin_promotions ap
  WHERE ap.user_id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_pending_role_grants_for_user(p_user_id uuid)
RETURNS TABLE(id uuid, discord_user_id text, role_id text, attempts integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role'
     AND auth.uid() <> p_user_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT q.id, q.discord_user_id, q.role_id, q.attempts
    FROM public.discord_role_grant_queue q
   WHERE q.user_id = p_user_id
     AND q.granted_at IS NULL
     AND q.next_attempt_at <= now()
   ORDER BY q.next_attempt_at ASC
   LIMIT 5;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_session_revoked(_user_id uuid, _issued_at timestamp with time zone)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role'
     AND auth.uid() <> _user_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _issued_at IS NULL OR _issued_at > now() + interval '5 minutes' THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.revoked_sessions
    WHERE user_id = _user_id AND revoked_at > _issued_at
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_2fa_grace_deadline(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_2fa_grace_active(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_own_promotions(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_pending_role_grants_for_user(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_session_revoked(uuid, timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_2fa_grace_deadline(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_2fa_grace_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_own_promotions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_pending_role_grants_for_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_session_revoked(uuid, timestamp with time zone) TO authenticated, service_role;

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
  'SEC-SELF-SCOPED-RPC-010',
  'Security hardening',
  90,
  'Self-scoped session and role helpers reject cross-user access',
  'Feature: Self-scoped security helper authorization\n  Scenario: A member requests another member security state\n    Given session, promotion, 2FA grace, and role-grant helpers run with elevated database privileges\n    When a non-admin signed-in user passes another user id\n    Then the helper rejects the request\n    And the same helper still works for the caller, administrators, and backend jobs',
  'implemented',
  'manual',
  'supabase/migrations/current_self_scoped_rpc_authorization.sql',
  'OWASP A01 regression guard for cross-user data disclosure in SECURITY DEFINER helpers.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();