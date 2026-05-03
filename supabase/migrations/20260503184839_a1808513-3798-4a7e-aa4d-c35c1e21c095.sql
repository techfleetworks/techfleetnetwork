
-- 1) View runs as caller, respecting their RLS
ALTER VIEW public.framework_entity_v SET (security_invoker = true);

-- 2) Revoke EXECUTE from anon/public on admin-ish RPCs (keep authenticated)
REVOKE EXECUTE ON FUNCTION public.fw_rebuild_all_edges()      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fw_replay_staging()         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fw_slug(text)               FROM PUBLIC, anon;

-- Defensive: ensure read RPCs stay callable by signed-in users only
REVOKE EXECUTE ON FUNCTION public.search_framework(text, integer)                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_node_neighbors(public.framework_entity_type, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.search_framework(text, integer)                     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_node_neighbors(public.framework_entity_type, uuid) TO authenticated;

-- 3) Pin search_path on the 3 helpers that were missing it
ALTER FUNCTION public.fw_rename_jsonb_keys(jsonb, text[]) SET search_path = public;
ALTER FUNCTION public.fw_split_dedupe(text)               SET search_path = public;
ALTER FUNCTION public.fw_table_to_entity(text)            SET search_path = public;
