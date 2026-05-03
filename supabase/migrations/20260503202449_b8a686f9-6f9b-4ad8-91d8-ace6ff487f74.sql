
REVOKE EXECUTE ON FUNCTION public.fleety_kb_semantic_search(vector, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fleety_match_playbooks_semantic(vector, text, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fleety_match_examples_semantic(vector, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fleety_playbooks_by_intent(text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleety_kb_semantic_search(vector, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fleety_match_playbooks_semantic(vector, text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fleety_match_examples_semantic(vector, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fleety_playbooks_by_intent(text, text, int) TO authenticated, service_role;
