-- Add email column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';

-- Update handle_new_user to also set email
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_first_name text;
  v_last_name text;
  v_display_name text;
  v_email text;
BEGIN
  v_first_name := COALESCE(
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'given_name',
    ''
  );
  v_last_name := COALESCE(
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'family_name',
    ''
  );
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    TRIM(v_first_name || ' ' || v_last_name),
    ''
  );
  v_email := COALESCE(NEW.email, '');

  INSERT INTO public.profiles (user_id, first_name, last_name, display_name, email)
  VALUES (NEW.id, v_first_name, v_last_name, v_display_name, v_email);
  RETURN NEW;
END;
$function$;