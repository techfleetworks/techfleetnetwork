
-- A/B prompt versions
CREATE TABLE IF NOT EXISTS public.fleety_prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  notes text,
  weight integer NOT NULL DEFAULT 0,         -- 0 = inactive; higher weight = more traffic
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fleety_prompt_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage prompt versions" ON public.fleety_prompt_versions;
CREATE POLICY "Admins manage prompt versions" ON public.fleety_prompt_versions
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
DROP POLICY IF EXISTS "Authenticated read active versions" ON public.fleety_prompt_versions;
CREATE POLICY "Authenticated read active versions" ON public.fleety_prompt_versions
  FOR SELECT TO authenticated USING (weight > 0 OR is_default OR has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_fleety_prompt_versions_updated_at
  BEFORE UPDATE ON public.fleety_prompt_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed a baseline default version
INSERT INTO public.fleety_prompt_versions (label, notes, weight, is_default)
VALUES ('baseline-2026-05', 'Initial action-first ordering with semantic retrieval', 100, true)
ON CONFLICT (label) DO NOTHING;

-- Tag turn signals with the version used
ALTER TABLE public.fleety_turn_signals
  ADD COLUMN IF NOT EXISTS prompt_version text;

CREATE INDEX IF NOT EXISTS idx_fleety_signals_version
  ON public.fleety_turn_signals (prompt_version, created_at DESC);

-- Reason chips on feedback
ALTER TABLE public.fleety_message_feedback
  ADD COLUMN IF NOT EXISTS reasons text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS playbook_slug text;

CREATE INDEX IF NOT EXISTS idx_fleety_feedback_reasons
  ON public.fleety_message_feedback USING gin (reasons);

-- Aggregated signals view (admin-only via underlying RLS on tables; the view inherits caller perms)
CREATE OR REPLACE VIEW public.fleety_signals_view AS
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
