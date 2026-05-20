-- Allow NULL so self-heal can clear unusable values without violating NOT NULL
ALTER TABLE public.profiles ALTER COLUMN discord_username DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_discord_username()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.discord_user_id IS NOT NULL AND NEW.discord_user_id <> '' THEN
    IF NEW.discord_username IS NOT NULL
       AND (btrim(NEW.discord_username) = ''
            OR NEW.discord_username = '.'
            OR btrim(regexp_replace(NEW.discord_username, '^\.+', '')) = '') THEN
      RAISE EXCEPTION 'discord_username cannot be empty or only dots when discord_user_id is set';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_discord_username() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_discord_username() FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_discord_username() FROM authenticated;

DROP TRIGGER IF EXISTS validate_discord_username_trg ON public.profiles;
CREATE TRIGGER validate_discord_username_trg
BEFORE INSERT OR UPDATE OF discord_username, discord_user_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.validate_discord_username();

UPDATE public.profiles
SET discord_username = NULL
WHERE discord_user_id IS NOT NULL
  AND discord_user_id <> ''
  AND discord_username IS NOT NULL
  AND (btrim(discord_username) = ''
       OR discord_username = '.'
       OR btrim(regexp_replace(discord_username, '^\.+', '')) = '');