CREATE OR REPLACE FUNCTION public.prevent_unverified_discord_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND (
       NEW.discord_username IS DISTINCT FROM OLD.discord_username
       OR NEW.discord_user_id IS DISTINCT FROM OLD.discord_user_id
     ) THEN
    NEW.discord_username := OLD.discord_username;
    NEW.discord_user_id := OLD.discord_user_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_unverified_discord_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_unverified_discord_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_unverified_discord_change() FROM authenticated;