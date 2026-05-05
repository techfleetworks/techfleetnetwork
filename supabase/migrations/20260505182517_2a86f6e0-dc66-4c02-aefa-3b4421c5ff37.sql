
-- 1. Profile insert guard: profile.user_id MUST point to a real auth.users row.
CREATE OR REPLACE FUNCTION public.enforce_profile_has_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'profiles.user_id cannot be null';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.user_id) THEN
    RAISE EXCEPTION 'profiles.user_id % has no matching auth.users row', NEW.user_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_has_auth_user ON public.profiles;
CREATE TRIGGER trg_enforce_profile_has_auth_user
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_has_auth_user();

-- 2. Nightly reconciliation: remove orphans on either side, write audit entry.
CREATE OR REPLACE FUNCTION public.reconcile_account_orphans()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_auth_orphans int := 0;
  v_profile_orphans int := 0;
  v_auth_id uuid;
  v_profile_user_id uuid;
BEGIN
  -- auth.users with no profile
  FOR v_auth_id IN
    SELECT u.id FROM auth.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE p.user_id IS NULL
  LOOP
    DELETE FROM auth.users WHERE id = v_auth_id;
    v_auth_orphans := v_auth_orphans + 1;
  END LOOP;

  -- profiles with no auth.users
  FOR v_profile_user_id IN
    SELECT p.user_id FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.user_id
    WHERE u.id IS NULL
  LOOP
    DELETE FROM public.profiles WHERE user_id = v_profile_user_id;
    v_profile_orphans := v_profile_orphans + 1;
  END LOOP;

  INSERT INTO public.audit_log (event_type, table_name, changed_fields)
  VALUES (
    'orphan_reconciliation',
    'auth.users+profiles',
    ARRAY[
      'auth_orphans_removed:' || v_auth_orphans::text,
      'profile_orphans_removed:' || v_profile_orphans::text
    ]
  );

  RETURN jsonb_build_object(
    'auth_orphans_removed', v_auth_orphans,
    'profile_orphans_removed', v_profile_orphans,
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_account_orphans() FROM PUBLIC, anon, authenticated;

-- 3. Schedule nightly run at 03:10 UTC.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('reconcile-account-orphans-nightly')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-account-orphans-nightly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'reconcile-account-orphans-nightly',
  '10 3 * * *',
  $cron$ SELECT public.reconcile_account_orphans(); $cron$
);
