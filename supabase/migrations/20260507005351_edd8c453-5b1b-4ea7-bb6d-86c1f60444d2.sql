-- 1. Public bucket listing fix (announcement-videos)
DROP POLICY IF EXISTS "Public read access to announcement-videos" ON storage.objects;
CREATE POLICY "Announcement videos are publicly viewable (no list)"
ON storage.objects FOR SELECT TO public
USING (
  bucket_id = 'announcement-videos'
  AND name IS NOT NULL
  AND length(name) > 0
);

-- 2. Trigger-only SECURITY DEFINER functions: revoke API EXECUTE
REVOKE EXECUTE ON FUNCTION public.audit_table_change_filtered() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_profile_has_auth_user() FROM anon, authenticated, PUBLIC;

-- 3. Admin-only Web Vitals reporting RPCs: revoke from anon (admin check happens inside)
REVOKE EXECUTE ON FUNCTION public.web_vitals_p75(integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.web_vitals_trend(integer) FROM anon, PUBLIC;

-- 4. Framework graph maintenance ops: revoke from anon (admin/cron only)
REVOKE EXECUTE ON FUNCTION public.fw_refresh_search_mv() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fw_sync_relationships_to_kb() FROM anon, PUBLIC;