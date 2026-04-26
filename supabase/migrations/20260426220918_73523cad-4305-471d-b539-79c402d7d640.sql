CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_event_type text,
  p_table_name text,
  p_record_id text,
  p_user_id uuid,
  p_changed_fields text[] DEFAULT NULL::text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_email text;
BEGIN
  v_actor_email := NULLIF(auth.jwt() ->> 'email', '');

  IF v_actor_email IS NULL AND p_user_id IS NOT NULL THEN
    SELECT NULLIF(email, '')
    INTO v_actor_email
    FROM public.profiles
    WHERE user_id = p_user_id
    LIMIT 1;
  END IF;

  INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, actor_email, changed_fields)
  VALUES (p_event_type, p_table_name, p_record_id, p_user_id, v_actor_email, p_changed_fields);
END;
$function$;