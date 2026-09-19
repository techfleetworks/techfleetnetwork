-- admin_list_users(): make the sort TOTAL so PostgREST .range() pagination can't skip a row.
--
-- UserAdminPage pages this SETOF via .range() in 1000-row windows (PostgREST caps each response
-- at max-rows). Each window is a SEPARATE SQL execution, so `ORDER BY u.created_at DESC` alone —
-- a NON-unique key — leaves the order among rows sharing a created_at unspecified and free to
-- differ between executions. A tied row straddling a 1000-row window boundary can then be dropped
-- from both windows and never returned (bulk-imported cohorts share created_at, so this is
-- plausible at ~1.7k accounts). The client de-dupes by user_id, which catches a boundary
-- DUPLICATE but cannot catch a boundary SKIP — the skipped account silently vanishes from the
-- roster and undercounts the "N users" badge (the exact bug this fix exists to close).
--
-- Fix: add a unique tiebreaker (u.id) so the ordering is total and deterministic across windows.
-- CREATE OR REPLACE of an existing function with an UNCHANGED signature — no new object (the
-- ADR-0036 db-schema-gate is unaffected), only the row ordering tightens. Safe to apply anytime.
-- Body is otherwise identical to 20260803140000_fix_admin_list_users_srf.sql.
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  user_id              uuid,
  email                text,
  email_confirmed      boolean,
  account_created_at   timestamptz,
  last_sign_in_at      timestamptz,
  phone                text,
  is_banned            boolean,
  auth_providers       text[],
  has_profile          boolean,
  profile_completed    boolean,
  first_name           text,
  last_name            text,
  display_name         text,
  discord_username     text,
  country              text,
  timezone             text,
  membership_tier      text,
  is_founding_member   boolean,
  is_test_account      boolean,
  onboarded_at         timestamptz,
  profile_created_at   timestamptz,
  profile              jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin_list_users: admin role required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    (u.email_confirmed_at IS NOT NULL),
    u.created_at,
    u.last_sign_in_at,
    u.phone::text,
    (u.banned_until IS NOT NULL AND u.banned_until > now()),
    COALESCE(
      (SELECT array_agg(DISTINCT prov)
         FROM jsonb_array_elements_text(
           COALESCE(u.raw_app_meta_data->'providers', '[]'::jsonb)
         ) AS prov),
      ARRAY[]::text[]),
    (p.user_id IS NOT NULL),
    COALESCE(p.profile_completed, false),
    p.first_name,
    p.last_name,
    p.display_name,
    p.discord_username,
    p.country,
    p.timezone,
    p.membership_tier::text,
    p.is_founding_member,
    COALESCE(p.is_test_account, false),
    p.onboarded_at,
    p.created_at,
    (to_jsonb(p) - 'guardian_consent_token')
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE u.deleted_at IS NULL
  ORDER BY u.created_at DESC, u.id DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
