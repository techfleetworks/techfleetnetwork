
-- Fleety self-improvement schema
-- Captures per-turn retrieval signals, user feedback, curator-approved
-- canned answers, and admin-proposed relationship rows. All admin-managed
-- tables are admin-only via has_role(); user feedback is owner-scoped.

-- 1. Per-turn retrieval/quality signals (written by techfleet-chat edge fn)
CREATE TABLE public.fleety_turn_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_query text NOT NULL,
  audience text NOT NULL DEFAULT 'member', -- member|teacher|admin
  kb_hit_count int NOT NULL DEFAULT 0,
  framework_hit_count int NOT NULL DEFAULT 0,
  web_hit_count int NOT NULL DEFAULT 0,
  canned_answer_id uuid,
  response_ms int,
  follow_up_within_60s boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fleety_signals_user ON public.fleety_turn_signals(user_id, created_at DESC);
CREATE INDEX idx_fleety_signals_gap ON public.fleety_turn_signals(created_at DESC)
  WHERE kb_hit_count = 0 AND framework_hit_count = 0;
ALTER TABLE public.fleety_turn_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own signals" ON public.fleety_turn_signals
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins see all signals" ON public.fleety_turn_signals
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. User feedback per assistant turn (thumbs up/down + optional comment)
CREATE TABLE public.fleety_message_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id uuid NOT NULL REFERENCES public.fleety_turn_signals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating IN (-1, 1)),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (turn_id, user_id)
);
CREATE INDEX idx_fleety_feedback_turn ON public.fleety_message_feedback(turn_id);
CREATE INDEX idx_fleety_feedback_rating ON public.fleety_message_feedback(rating, created_at DESC);
ALTER TABLE public.fleety_message_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own feedback" ON public.fleety_message_feedback
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins read all feedback" ON public.fleety_message_feedback
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Curator-approved canned answers — highest-priority retrieval source
CREATE TABLE public.fleety_canned_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_pattern text NOT NULL, -- canonical phrasing of the question
  answer_md text NOT NULL,        -- the approved answer (markdown)
  audience text NOT NULL DEFAULT 'all', -- all|member|teacher|admin
  source_turn_id uuid REFERENCES public.fleety_turn_signals(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fleety_canned_enabled ON public.fleety_canned_answers(enabled) WHERE enabled;
CREATE INDEX idx_fleety_canned_pattern_trgm ON public.fleety_canned_answers
  USING gin (question_pattern gin_trgm_ops);
ALTER TABLE public.fleety_canned_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authed reads enabled canned answers" ON public.fleety_canned_answers
  FOR SELECT TO authenticated USING (enabled = true);
CREATE POLICY "Admins manage canned answers" ON public.fleety_canned_answers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_fleety_canned_answers_updated_at
  BEFORE UPDATE ON public.fleety_canned_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Admin-proposed framework relationships (auto-suggested from chat)
CREATE TABLE public.fleety_proposed_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity text NOT NULL,
  to_entity text NOT NULL,
  description text NOT NULL,
  inverse_description text,
  source_turn_id uuid REFERENCES public.fleety_turn_signals(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fleety_proposed_status ON public.fleety_proposed_relationships(status, created_at DESC);
ALTER TABLE public.fleety_proposed_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage proposed relationships" ON public.fleety_proposed_relationships
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. Nightly topic clusters / knowledge gaps
CREATE TABLE public.fleety_topic_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  sample_query text NOT NULL,
  query_count int NOT NULL DEFAULT 1,
  gap boolean NOT NULL DEFAULT false, -- true = no KB / framework hits
  thumbs_up int NOT NULL DEFAULT 0,
  thumbs_down int NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fleety_topic_recent ON public.fleety_topic_insights(generated_at DESC);
ALTER TABLE public.fleety_topic_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read topic insights" ON public.fleety_topic_insights
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage topic insights" ON public.fleety_topic_insights
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Ensure pg_trgm exists for canned-answer fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- RPC: fetch top-N best-rated canned answers matching a query (trigram similarity)
CREATE OR REPLACE FUNCTION public.fleety_match_canned_answers(
  p_query text,
  p_audience text DEFAULT 'all',
  p_limit int DEFAULT 3
) RETURNS TABLE (
  id uuid,
  question_pattern text,
  answer_md text,
  similarity real,
  thumbs_up bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    c.id,
    c.question_pattern,
    c.answer_md,
    similarity(c.question_pattern, p_query) AS similarity,
    COALESCE((
      SELECT count(*) FROM public.fleety_message_feedback f
      WHERE f.turn_id = c.source_turn_id AND f.rating = 1
    ), 0) AS thumbs_up
  FROM public.fleety_canned_answers c
  WHERE c.enabled = true
    AND (c.audience = 'all' OR c.audience = p_audience)
    AND similarity(c.question_pattern, p_query) > 0.25
  ORDER BY similarity DESC, thumbs_up DESC
  LIMIT GREATEST(1, LEAST(p_limit, 10));
$$;

-- RPC: top thumbs-up'd past Q&A pairs as few-shot examples for a query
CREATE OR REPLACE FUNCTION public.fleety_few_shot_examples(
  p_query text,
  p_limit int DEFAULT 3
) RETURNS TABLE (
  user_query text,
  assistant_response text,
  thumbs_up bigint,
  similarity real
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH up AS (
    SELECT s.id AS turn_id, s.user_query, s.conversation_id, s.created_at,
           count(*) AS thumbs_up
    FROM public.fleety_turn_signals s
    JOIN public.fleety_message_feedback f
      ON f.turn_id = s.id AND f.rating = 1
    WHERE similarity(s.user_query, p_query) > 0.25
    GROUP BY s.id, s.user_query, s.conversation_id, s.created_at
  )
  SELECT
    up.user_query,
    -- pull the assistant message that came right after this user turn
    (
      SELECT m.content FROM public.chat_messages m
      WHERE m.conversation_id = up.conversation_id
        AND m.role = 'assistant'
        AND m.created_at >= up.created_at
      ORDER BY m.created_at ASC LIMIT 1
    ) AS assistant_response,
    up.thumbs_up,
    similarity(up.user_query, p_query) AS similarity
  FROM up
  ORDER BY up.thumbs_up DESC, similarity DESC
  LIMIT GREATEST(1, LEAST(p_limit, 5));
$$;

-- RPC: approve a proposed relationship → insert into reference_relationships
CREATE OR REPLACE FUNCTION public.fleety_approve_relationship(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO r FROM public.fleety_proposed_relationships WHERE id = p_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'not found or not pending'; END IF;
  INSERT INTO public.reference_relationships (from_entity, to_entity, description, inverse_description)
  VALUES (r.from_entity, r.to_entity, r.description, r.inverse_description)
  ON CONFLICT DO NOTHING;
  UPDATE public.fleety_proposed_relationships
    SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = p_id;
END $$;

GRANT EXECUTE ON FUNCTION public.fleety_match_canned_answers(text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleety_few_shot_examples(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleety_approve_relationship(uuid) TO authenticated;
