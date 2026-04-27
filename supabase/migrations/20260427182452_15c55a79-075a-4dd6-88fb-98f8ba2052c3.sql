CREATE OR REPLACE FUNCTION public.set_email_visibility_timeout(queue_name text, message_id bigint, vt integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM pgmq.set_vt(queue_name, message_id, vt);
  RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_email_visibility_timeout(text, bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_email_visibility_timeout(text, bigint, integer) TO service_role;