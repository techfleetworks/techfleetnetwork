
CREATE OR REPLACE FUNCTION public.cleanup_chunk_load_noise()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resolved integer := 0;
BEGIN
  WITH updated AS (
    UPDATE public.agent_fix_queue
       SET status = 'resolved',
           dismissed_reason = 'auto-resolved: chunk_load (deploy-induced, self-heals on reload)',
           updated_at = now()
     WHERE status IN ('pending','triaged','proposed')
       AND event_type = 'ui_chunk_load_failed'
    RETURNING 1
  )
  SELECT count(*) INTO v_resolved FROM updated;

  RETURN jsonb_build_object('resolved', v_resolved);
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_chunk_load_noise() FROM PUBLIC, anon, authenticated;

INSERT INTO public.system_remediations (
  signature_pattern,
  event_type_filter,
  remediation_function,
  description,
  enabled,
  cooldown_seconds
)
VALUES (
  'chunk.?load|Loading chunk|dynamically imported module',
  'ui_chunk_load_failed',
  'cleanup_chunk_load_noise',
  'Auto-resolve ui_chunk_load_failed fix-queue entries (deploy-induced, self-heals on reload)',
  true,
  600
)
ON CONFLICT DO NOTHING;
