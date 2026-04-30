GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.announcements
TO authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sanitize_user_html(text) TO authenticated;