
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_first_name text;
  v_last_name text;
  v_display_name text;
  v_email text;
  v_birth_year smallint;
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

  BEGIN
    v_birth_year := NULLIF(NEW.raw_user_meta_data->>'birth_year','')::smallint;
    IF v_birth_year IS NOT NULL AND (v_birth_year < 1900 OR v_birth_year > EXTRACT(YEAR FROM now())::int) THEN
      v_birth_year := NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_birth_year := NULL;
  END;

  INSERT INTO public.profiles (user_id, first_name, last_name, display_name, email, birth_year)
  VALUES (NEW.id, v_first_name, v_last_name, v_display_name, v_email, v_birth_year);
  RETURN NEW;
END;
$function$;
