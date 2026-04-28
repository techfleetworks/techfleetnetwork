CREATE OR REPLACE FUNCTION public.admin_2fa_grace_deadline(_user_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT GREATEST(MIN(created_at), TIMESTAMPTZ '2026-04-28 00:00:00+00') + interval '5 days'
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = 'admin'::public.app_role
    ),
    TIMESTAMPTZ '2026-04-28 00:00:00+00' + interval '5 days'
  );
$function$;

CREATE OR REPLACE FUNCTION public.admin_2fa_grace_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT now() < public.admin_2fa_grace_deadline(_user_id);
$function$;

REVOKE ALL ON FUNCTION public.admin_2fa_grace_deadline(uuid) FROM public;
REVOKE ALL ON FUNCTION public.admin_2fa_grace_active(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_2fa_grace_deadline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_2fa_grace_active(uuid) TO authenticated;