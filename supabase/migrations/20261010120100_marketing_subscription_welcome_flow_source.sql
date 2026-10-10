-- Welcome Flow newsletter step (e): additively accept p_source = 'welcome_flow' in the existing
-- marketing-subscription RPC. ADR-0017 (Email Octopus is the marketing source of truth) +
-- ADR 20261009-welcome-flow-eo-extension (P7).
--
-- EXPAND, backward-compatible (supabase/migrations/CLAUDE.md, ADR-0026): same signature
-- (boolean, text), so this is an in-place body change, NOT a signature drop. The ONLY behavior
-- change is that 'welcome_flow' is now kept instead of silently coerced to 'profile' — every
-- existing caller ('signup' | 'profile') behaves exactly as before. This MUST land before any
-- consumer sends 'welcome_flow' (today the RPC coerces unknown sources to 'profile',
-- 20260822120000_email_octopus_sync.sql:87-89). p_source remains telemetry-only / not persisted
-- (consent origin of record is EO + the sync row's version/updated_at, per ADR-0017). Idempotent
-- (CREATE OR REPLACE). Still self-only (pins to auth.uid(); no email parameter) and fail-open
-- (records intent, never calls EO).
CREATE OR REPLACE FUNCTION public.set_my_marketing_subscription(
  p_subscribed boolean,
  p_source text DEFAULT 'profile'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_email  text;
  v_first  text;
  v_status text := CASE WHEN p_subscribed THEN 'subscribed' ELSE 'unsubscribed' END;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  -- Accepted set expanded additively with 'welcome_flow'; anything else still coerces to 'profile'.
  IF p_source NOT IN ('signup', 'profile', 'welcome_flow') THEN
    p_source := 'profile';
  END IF;

  SELECT lower(email), first_name INTO v_email, v_first
  FROM public.profiles WHERE user_id = v_uid;
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'no email on profile' USING errcode = 'P0002';
  END IF;

  -- Desired-state upsert: bump version and reset the worker's retry state so the latest intent wins,
  -- even if a prior attempt had gone to DLQ.
  INSERT INTO public.email_octopus_contact_sync AS s
    (email, user_id, desired_status, fields, version, synced_version, status,
     attempts, next_attempt_at, last_error, last_status_code, dlq_reason, updated_at)
  VALUES
    (v_email, v_uid, v_status,
     jsonb_strip_nulls(jsonb_build_object('first_name', v_first)),
     1, 0, 'pending', 0, now(), NULL, NULL, NULL, now())
  ON CONFLICT (email) DO UPDATE SET
     user_id          = EXCLUDED.user_id,
     desired_status   = EXCLUDED.desired_status,
     fields           = EXCLUDED.fields,
     version          = s.version + 1,
     status           = 'pending',
     attempts         = 0,
     next_attempt_at  = now(),
     last_error       = NULL,
     last_status_code = NULL,
     dlq_reason       = NULL,
     updated_at       = now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_marketing_subscription(boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_marketing_subscription(boolean, text) TO authenticated;
