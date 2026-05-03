
REVOKE EXECUTE ON FUNCTION public.fleety_match_canned_answers(text, text, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fleety_few_shot_examples(text, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fleety_approve_relationship(uuid) FROM PUBLIC, anon;
