
-- Tighten EXECUTE on SECURITY DEFINER functions per linter 0028/0029.
-- Service-role-only RPCs: revoke from anon/authenticated/PUBLIC entirely.
REVOKE EXECUTE ON FUNCTION public.fw_lookup_relationships(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_nodes_neighbors_batch(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_dispute(text, text, text, text, inet) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_sanctions_screening(text, text, text, text, text, inet) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_policy_ack(text[], text, text, inet, text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_dsar(dsar_type, jsonb, text) FROM PUBLIC, anon, authenticated;

-- Authenticated-only RPCs (admin checks live inside the function bodies):
REVOKE EXECUTE ON FUNCTION public.count_classes_pending_review() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.count_classes_pending_review() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.open_incident(incident_severity, text, text, integer, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.open_incident(incident_severity, text, text, integer, text[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.request_human_review(text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.request_human_review(text, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_audit_policy() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_audit_policy() TO authenticated;

-- peek_rate_limit / record_rate_limit_failure remain anon-callable on purpose
-- (used pre-auth by login, register, forgot-password flows).
