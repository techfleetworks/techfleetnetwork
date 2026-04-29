-- OWASP A01 Broken Access Control: move self-scoped RPCs to caller-scoped execution.
-- Add narrowly scoped RLS policies where existing user flows need owner access.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_promotions'
      AND policyname = 'Users can view their own promotions'
  ) THEN
    CREATE POLICY "Users can view their own promotions"
    ON public.admin_promotions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'two_factor_login_sessions'
      AND policyname = 'Users can create own verified 2FA login session'
  ) THEN
    CREATE POLICY "Users can create own verified 2FA login session"
    ON public.two_factor_login_sessions
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'two_factor_login_sessions'
      AND policyname = 'Users can refresh own verified 2FA login session'
  ) THEN
    CREATE POLICY "Users can refresh own verified 2FA login session"
    ON public.two_factor_login_sessions
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_2fa_grace_deadline(_user_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deadline timestamptz;
BEGIN
  IF auth.uid() IS NULL OR _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.uid() <> _user_id AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
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
 SECURITY INVOKER
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
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.uid() <> p_user_id AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT ap.id, ap.user_id, ap.promoted_by, ap.created_at, ap.confirmed_at
  FROM public.admin_promotions ap
  WHERE ap.user_id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_session_revoked(_user_id uuid, _issued_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.uid() <> _user_id AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
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

CREATE OR REPLACE FUNCTION public.list_pending_role_grants_for_user(p_user_id uuid)
 RETURNS TABLE(id uuid, discord_user_id text, role_id text, attempts integer)
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.uid() <> p_user_id AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
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

CREATE OR REPLACE FUNCTION public.mark_two_factor_login_verified(_session_hash text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aal text;
  v_session_hash text := lower(trim(coalesce(_session_hash, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_session_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid session proof';
  END IF;

  v_aal := coalesce(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'aal'),
    ''
  );

  IF v_aal <> 'aal2' THEN
    RAISE EXCEPTION '2FA verification required';
  END IF;

  INSERT INTO public.two_factor_login_sessions (
    user_id,
    session_token_hash,
    verified_at,
    expires_at
  ) VALUES (
    auth.uid(),
    v_session_hash,
    now(),
    now() + interval '10 minutes'
  )
  ON CONFLICT (user_id, session_token_hash) DO UPDATE SET
    verified_at = excluded.verified_at,
    expires_at = excluded.expires_at;

  RETURN true;
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
  'SEC-SELF-INVOKER-RPCS-013',
  'Security: OWASP Self-Scoped RPC Least Privilege',
  13,
  'Self-scoped security RPCs run with caller permissions',
  'Feature: OWASP A01 self-scoped RPC least privilege
  As a platform security reviewer
  I want self-scoped helper RPCs to rely on database access rules
  So that elevated execution is not used where owner policies are sufficient

  Scenario: A user can read only their own security state
    Given a signed-in user
    When the user requests their own 2FA grace deadline, session revocation status, pending role grants, or promotion records
    Then the request succeeds only for records tied to that user

  Scenario: A user cannot read another user security state
    Given a signed-in non-admin user
    When the user requests another user security state through a helper RPC
    Then the database denies the request

  Scenario: Verified 2FA login sessions remain owner-scoped
    Given a signed-in user with an aal2 session
    When the user marks a hashed session proof as verified
    Then only an owned verification session can be created or refreshed',
  'implemented'::public.bdd_status,
  'manual'::public.bdd_test_type,
  'supabase/migrations/2026042914_self_scoped_invoker_rpcs.sql',
  'Covers OWASP A01 conversion of self-scoped RPCs from SECURITY DEFINER to SECURITY INVOKER with owner-scoped RLS support.'
) ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();