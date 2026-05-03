REVOKE EXECUTE ON FUNCTION public.fleety_match_playbooks(TEXT,TEXT,INT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fleety_match_examples(TEXT,TEXT,INT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fleety_record_action(UUID,TEXT,TEXT,TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fleety_recompute_practical_scores(INT) FROM PUBLIC, anon, authenticated;