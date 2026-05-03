
DROP VIEW IF EXISTS public.fleety_signals_view;
CREATE VIEW public.fleety_signals_view
  WITH (security_invoker = true) AS
SELECT
  s.id,
  s.created_at,
  s.user_id,
  s.audience,
  s.intent,
  s.user_query,
  s.kb_hit_count,
  s.framework_hit_count,
  s.web_hit_count,
  s.playbook_hits,
  s.example_hits,
  s.chips_clicked,
  s.practical_score,
  s.prompt_version,
  s.canned_answer_id,
  COALESCE(f.rating, 0)                              AS rating,
  COALESCE(array_length(f.reasons, 1), 0)            AS reason_count,
  f.reasons                                          AS feedback_reasons,
  COALESCE(a.action_count, 0)                        AS action_count
FROM public.fleety_turn_signals s
LEFT JOIN public.fleety_message_feedback f ON f.turn_id = s.id
LEFT JOIN LATERAL (
  SELECT count(*)::int AS action_count
  FROM public.fleety_action_events ae
  WHERE ae.turn_id = s.id
) a ON true;

REVOKE ALL ON public.fleety_signals_view FROM PUBLIC, anon;
GRANT SELECT ON public.fleety_signals_view TO authenticated;
