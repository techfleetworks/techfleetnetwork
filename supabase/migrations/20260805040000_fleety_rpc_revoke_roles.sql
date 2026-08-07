-- Corrective (adversarial review HIGH-1): close the IDOR on the Fleety DEFINER
-- RPCs. `REVOKE ALL ... FROM PUBLIC` does NOT remove the DIRECT EXECUTE grant
-- Supabase gives anon/authenticated via `ALTER DEFAULT PRIVILEGES ... GRANT ALL
-- ON FUNCTIONS TO anon, authenticated, service_role` at CREATE time. For
-- fleety_load_user_memories(uuid) — SECURITY DEFINER, caller-supplied p_user_id,
-- no auth.uid() bind — that leftover grant lets any authenticated user read
-- another user's Fleety memories via PostgREST (IDOR + PII). Revoke from the
-- NAMED roles explicitly. Idempotent; safe to re-run.

REVOKE ALL ON FUNCTION public.fleety_load_user_memories(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleety_load_user_memories(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.fleety_observe_synonym(text, text, text, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleety_observe_synonym(text, text, text, int) TO service_role;
