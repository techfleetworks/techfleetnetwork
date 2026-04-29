-- OWASP A01/A09 hardening: user-scoped SECURITY DEFINER helpers must enforce caller authorization.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed boolean;
BEGIN
  IF auth.role() = 'service_role' THEN
    v_allowed := true;
  ELSIF auth.uid() IS NULL THEN
    v_allowed := false;
  ELSIF auth.uid() = _user_id THEN
    v_allowed := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'admin'::public.app_role
    ) INTO v_allowed;
  END IF;

  IF NOT COALESCE(v_allowed, false) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_elevated(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.has_role(_user_id, 'admin'::public.app_role);
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_pii_access(
  p_accessed_user_id uuid,
  p_access_reason text DEFAULT 'admin_view'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reason text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.role() <> 'service_role'
     AND auth.uid() <> p_accessed_user_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized to log PII access for this user';
  END IF;

  IF p_accessed_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing accessed user';
  END IF;

  v_reason := left(COALESCE(NULLIF(regexp_replace(p_access_reason, '[^A-Za-z0-9_.:-]', '', 'g'), ''), 'admin_view'), 80);

  INSERT INTO public.audit_log (
    event_type,
    table_name,
    record_id,
    user_id,
    changed_fields
  ) VALUES (
    'pii_access',
    'profiles',
    p_accessed_user_id::text,
    auth.uid(),
    ARRAY[v_reason]
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_elevated(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_pii_access(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_elevated(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_pii_access(uuid, text) TO authenticated, service_role;

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
  'SEC-ROLE-PII-AUTHZ-007',
  'Security hardening',
  90,
  'Role and PII helpers enforce caller authorization',
  'Feature: User-scoped security helper authorization\n  Scenario: A signed-in user attempts to inspect or log security data for another member\n    Given role checks and PII access logs run with elevated database privileges\n    When a non-admin requests another member role or writes a PII access event for another member\n    Then the helper denies or returns no privileged information\n    And admins and backend jobs can still perform legitimate cross-user security checks',
  'implemented',
  'manual',
  'supabase/migrations/current_role_pii_helper_authorization.sql',
  'OWASP A01/A09 guard for broken access control and audit integrity.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();