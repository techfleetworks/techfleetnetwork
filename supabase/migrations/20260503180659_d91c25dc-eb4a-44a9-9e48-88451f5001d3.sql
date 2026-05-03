
-- Revoke broad EXECUTE
REVOKE EXECUTE ON FUNCTION public.get_node_neighbors(public.framework_entity_type, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_framework(text, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_deliverable_context(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_milestone_blueprint(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_company_type_context(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_stakeholder_context(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fw_refresh_neighbors_mv() FROM PUBLIC, anon;

-- Internal helpers: service-role only
REVOKE EXECUTE ON FUNCTION public.fw_resolve_entity(public.framework_entity_type, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fw_upsert_edge(public.framework_entity_type, uuid, public.framework_rel_type, public.framework_entity_type, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fw_emit_edges_for_entity(public.framework_entity_type, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fw_rebuild_all_edges() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fw_rename_jsonb_keys(jsonb, text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fw_split_dedupe(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fw_table_to_entity(text) FROM PUBLIC, anon, authenticated;

-- Hide MV from PostgREST
REVOKE ALL ON public.framework_node_neighbors_mv FROM PUBLIC, anon, authenticated;

-- Move MV out of API schema (or just keep grants tight). PostgREST exposes by GRANT.
-- It now has no SELECT for anon/authenticated, so it's effectively hidden.
