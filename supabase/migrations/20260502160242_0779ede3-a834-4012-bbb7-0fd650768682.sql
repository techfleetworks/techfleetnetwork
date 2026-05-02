
REVOKE EXECUTE ON FUNCTION public.submit_class_for_review(uuid, uuid[]) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.approve_and_publish_class(uuid)        FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.request_class_changes(uuid, text)      FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.archive_class(uuid, text)              FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cancel_cohort(uuid, text)              FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.register_for_cohort_click(uuid, text)  FROM anon, public;

GRANT EXECUTE ON FUNCTION public.submit_class_for_review(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_and_publish_class(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_class_changes(uuid, text)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_class(uuid, text)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_cohort(uuid, text)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_cohort_click(uuid, text)  TO authenticated;
