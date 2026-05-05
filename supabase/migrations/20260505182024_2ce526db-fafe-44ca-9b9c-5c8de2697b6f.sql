-- 0) Repair handle_user_deletion: audit_log is append-only (project policy),
--    so the existing trigger was raising and aborting full cascades. Drop the
--    audit_log line; keep all other cleanups identical.
CREATE OR REPLACE FUNCTION public.handle_user_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  DELETE FROM public.user_quest_selections WHERE user_id = OLD.id;
  DELETE FROM public.push_subscriptions WHERE user_id = OLD.id;
  DELETE FROM public.chat_messages WHERE conversation_id IN (
    SELECT id FROM public.chat_conversations WHERE user_id = OLD.id
  );
  DELETE FROM public.chat_conversations WHERE user_id = OLD.id;
  DELETE FROM public.journey_progress WHERE user_id = OLD.id;
  DELETE FROM public.announcement_reads WHERE user_id = OLD.id;
  DELETE FROM public.dashboard_preferences WHERE user_id = OLD.id;
  DELETE FROM public.grid_view_states WHERE user_id = OLD.id;
  DELETE FROM public.project_applications WHERE user_id = OLD.id;
  DELETE FROM public.general_applications WHERE user_id = OLD.id;
  DELETE FROM public.admin_promotions WHERE user_id = OLD.id;
  DELETE FROM public.user_roles WHERE user_id = OLD.id;
  DELETE FROM public.notifications WHERE user_id = OLD.id;
  DELETE FROM public.feedback WHERE user_id = OLD.id;
  -- audit_log intentionally retained for SOC 2 hash-chain (append-only).
  DELETE FROM public.profiles WHERE user_id = OLD.id;
  RETURN OLD;
END;
$function$;

-- 1) Audit + hard-delete the orphan auth.users rows.
WITH orphans AS (
  SELECT u.id, u.email
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE p.user_id IS NULL AND u.deleted_at IS NULL
),
audited AS (
  INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, error_message, changed_fields)
  SELECT 'orphan_auth_user_purged', 'auth.users', o.id, NULL,
         'Auth row had no matching public.profiles row; purged during orphan reconciliation.',
         ARRAY['email_domain=' || split_part(o.email, '@', 2)]::text[]
  FROM orphans o
  RETURNING 1
)
DELETE FROM auth.users
WHERE id IN (SELECT id FROM orphans);

-- 2) Profile-delete cascade safeguard: removing a profile also removes the auth row.
CREATE OR REPLACE FUNCTION public.cascade_delete_auth_user_on_profile_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF OLD.user_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = OLD.user_id;
  END IF;
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  -- Never block the profile delete on auth cleanup; surface via audit instead.
  INSERT INTO public.audit_log (event_type, table_name, record_id, error_message)
  VALUES ('cascade_auth_delete_failed', 'profiles', OLD.user_id, SQLERRM);
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.cascade_delete_auth_user_on_profile_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cascade_delete_auth_on_profile ON public.profiles;
CREATE TRIGGER trg_cascade_delete_auth_on_profile
AFTER DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.cascade_delete_auth_user_on_profile_delete();