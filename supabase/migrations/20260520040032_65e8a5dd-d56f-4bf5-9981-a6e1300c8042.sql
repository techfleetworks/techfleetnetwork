ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_not_test_account
  ON public.profiles (user_id)
  WHERE is_test_account = false;

DROP FUNCTION IF EXISTS public.admin_set_test_account(uuid, boolean);

CREATE FUNCTION public.admin_set_test_account(_user_id uuid, _is_test boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles SET is_test_account = _is_test WHERE user_id = _user_id;
  BEGIN
    INSERT INTO public.audit_log (actor_user_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'profile.is_test_account.set', 'profile', _user_id::text,
            jsonb_build_object('is_test_account', _is_test));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN true;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_set_test_account(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_test_account(uuid, boolean) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recompute-network-stats-every-15m') THEN
      PERFORM cron.unschedule('recompute-network-stats-every-15m');
    END IF;
    PERFORM cron.schedule(
      'recompute-network-stats-every-15m',
      '*/15 * * * *',
      $cron$ SELECT public.recompute_all_stats(); $cron$
    );
  END IF;
END $$;