
ALTER FUNCTION public.fw_slug(text) SET search_path = public;
ALTER FUNCTION public.fw_label(text) SET search_path = public;
ALTER FUNCTION public.fw_table(text) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.fw_upsert_kb(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fw_delete_kb(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_sync_reference_to_kb() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_sync_relationship_to_kb() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fw_build_entity_content(text, text, text) FROM PUBLIC, anon, authenticated;
