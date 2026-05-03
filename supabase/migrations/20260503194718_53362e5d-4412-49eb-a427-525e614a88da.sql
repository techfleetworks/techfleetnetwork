-- ============================================================
-- Fleety Practical Mode: playbooks, examples, action tracking
-- ============================================================

-- 1. Playbooks (the missing practical content)
CREATE TABLE IF NOT EXISTS public.fleety_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  intent TEXT NOT NULL DEFAULT 'how_to' CHECK (intent IN ('how_to','troubleshoot','decision','reference')),
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','member','teacher','admin')),
  trigger_phrases TEXT[] NOT NULL DEFAULT '{}',
  when_to_use TEXT NOT NULL,
  direct_answer TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,           -- [{n:1, action:"...", time_estimate:"15 min"}]
  done_criteria TEXT[] NOT NULL DEFAULT '{}',
  common_pitfalls TEXT[] NOT NULL DEFAULT '{}',
  ask_for_help TEXT,                                   -- "Post in #ux-research"
  example_artifact_url TEXT,
  related_entity_types TEXT[] NOT NULL DEFAULT '{}',
  related_entity_slugs TEXT[] NOT NULL DEFAULT '{}',
  action_chips JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{label:"Open template", url:"...", kind:"link"}]
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fleety_playbooks_active ON public.fleety_playbooks(is_active) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_fleety_playbooks_intent ON public.fleety_playbooks(intent);
CREATE INDEX IF NOT EXISTS idx_fleety_playbooks_audience ON public.fleety_playbooks(audience);
CREATE INDEX IF NOT EXISTS idx_fleety_playbooks_triggers_gin ON public.fleety_playbooks USING GIN(trigger_phrases);
CREATE INDEX IF NOT EXISTS idx_fleety_playbooks_tags_gin ON public.fleety_playbooks USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_fleety_playbooks_title_trgm ON public.fleety_playbooks USING GIN(title gin_trgm_ops);

ALTER TABLE public.fleety_playbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active playbooks"
  ON public.fleety_playbooks FOR SELECT
  TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins manage playbooks"
  ON public.fleety_playbooks FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_fleety_playbooks_updated_at
  BEFORE UPDATE ON public.fleety_playbooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Worked examples
CREATE TABLE IF NOT EXISTS public.fleety_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  deliverable_type TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','member','teacher','admin')),
  summary TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  source_url TEXT,
  anonymized BOOLEAN NOT NULL DEFAULT true,
  tags TEXT[] NOT NULL DEFAULT '{}',
  related_playbook_slug TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fleety_examples_active ON public.fleety_examples(is_active) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_fleety_examples_deliverable ON public.fleety_examples(deliverable_type);
CREATE INDEX IF NOT EXISTS idx_fleety_examples_tags_gin ON public.fleety_examples USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_fleety_examples_title_trgm ON public.fleety_examples USING GIN(title gin_trgm_ops);

ALTER TABLE public.fleety_examples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active examples"
  ON public.fleety_examples FOR SELECT
  TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins manage examples"
  ON public.fleety_examples FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_fleety_examples_updated_at
  BEFORE UPDATE ON public.fleety_examples
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Extend turn signals with practical-mode columns
ALTER TABLE public.fleety_turn_signals
  ADD COLUMN IF NOT EXISTS intent TEXT,
  ADD COLUMN IF NOT EXISTS playbook_hits INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS example_hits INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chips_clicked INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS practical_score NUMERIC(4,3);

CREATE INDEX IF NOT EXISTS idx_fleety_turn_signals_intent ON public.fleety_turn_signals(intent);

-- 4. Action events (chip clicks, link opens) → drives practical_score
CREATE TABLE IF NOT EXISTS public.fleety_action_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id UUID REFERENCES public.fleety_turn_signals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('chip_click','link_open','step_done','copy','discord_post','example_view','playbook_open')),
  action_label TEXT,
  target_url TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fleety_action_events_turn ON public.fleety_action_events(turn_id);
CREATE INDEX IF NOT EXISTS idx_fleety_action_events_user ON public.fleety_action_events(user_id);
CREATE INDEX IF NOT EXISTS idx_fleety_action_events_occurred ON public.fleety_action_events(occurred_at DESC);

ALTER TABLE public.fleety_action_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert their own action events"
  ON public.fleety_action_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read their own action events"
  ON public.fleety_action_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins manage action events"
  ON public.fleety_action_events FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 5. RPC: match playbooks (trigram on triggers/title/tags + audience filter)
CREATE OR REPLACE FUNCTION public.fleety_match_playbooks(
  p_query TEXT,
  p_audience TEXT DEFAULT 'all',
  p_limit INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  title TEXT,
  intent TEXT,
  direct_answer TEXT,
  steps JSONB,
  done_criteria TEXT[],
  common_pitfalls TEXT[],
  ask_for_help TEXT,
  example_artifact_url TEXT,
  action_chips JSONB,
  similarity NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (SELECT lower(coalesce(p_query,'')) AS qt)
  SELECT p.id, p.slug, p.title, p.intent, p.direct_answer, p.steps,
         p.done_criteria, p.common_pitfalls, p.ask_for_help, p.example_artifact_url, p.action_chips,
         GREATEST(
           similarity(lower(p.title), q.qt),
           COALESCE((SELECT MAX(similarity(lower(t), q.qt)) FROM unnest(p.trigger_phrases) t), 0),
           COALESCE((SELECT MAX(similarity(lower(t), q.qt)) FROM unnest(p.tags) t), 0)
         )::numeric AS similarity
  FROM public.fleety_playbooks p, q
  WHERE p.is_active
    AND (p.audience = 'all' OR p.audience = p_audience)
    AND (
      lower(p.title) % q.qt
      OR EXISTS (SELECT 1 FROM unnest(p.trigger_phrases) t WHERE lower(t) % q.qt)
      OR EXISTS (SELECT 1 FROM unnest(p.tags) t WHERE lower(t) % q.qt)
    )
  ORDER BY similarity DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.fleety_match_playbooks(TEXT,TEXT,INT) TO authenticated, service_role;

-- 6. RPC: match examples
CREATE OR REPLACE FUNCTION public.fleety_match_examples(
  p_query TEXT,
  p_playbook_slug TEXT DEFAULT NULL,
  p_limit INT DEFAULT 2
)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  title TEXT,
  deliverable_type TEXT,
  summary TEXT,
  excerpt TEXT,
  source_url TEXT,
  similarity NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (SELECT lower(coalesce(p_query,'')) AS qt)
  SELECT e.id, e.slug, e.title, e.deliverable_type, e.summary, e.excerpt, e.source_url,
         GREATEST(
           similarity(lower(e.title), q.qt),
           similarity(lower(e.deliverable_type), q.qt),
           COALESCE((SELECT MAX(similarity(lower(t), q.qt)) FROM unnest(e.tags) t), 0),
           CASE WHEN p_playbook_slug IS NOT NULL AND e.related_playbook_slug = p_playbook_slug THEN 1.0 ELSE 0 END
         )::numeric AS similarity
  FROM public.fleety_examples e, q
  WHERE e.is_active
    AND (
      p_playbook_slug IS NOT NULL AND e.related_playbook_slug = p_playbook_slug
      OR lower(e.title) % q.qt
      OR lower(e.deliverable_type) % q.qt
      OR EXISTS (SELECT 1 FROM unnest(e.tags) t WHERE lower(t) % q.qt)
    )
  ORDER BY similarity DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.fleety_match_examples(TEXT,TEXT,INT) TO authenticated, service_role;

-- 7. RPC: record an action event (chip click, link open, etc.)
CREATE OR REPLACE FUNCTION public.fleety_record_action(
  p_turn_id UUID,
  p_action_type TEXT,
  p_action_label TEXT DEFAULT NULL,
  p_target_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_action_type NOT IN ('chip_click','link_open','step_done','copy','discord_post','example_view','playbook_open') THEN
    RAISE EXCEPTION 'invalid action_type';
  END IF;

  INSERT INTO public.fleety_action_events(turn_id, user_id, action_type, action_label, target_url)
  VALUES (p_turn_id, v_user_id, p_action_type, left(coalesce(p_action_label,''), 200), left(coalesce(p_target_url,''), 500))
  RETURNING id INTO v_id;

  -- Increment chips_clicked counter on the turn for fast aggregation
  IF p_turn_id IS NOT NULL AND p_action_type IN ('chip_click','link_open','playbook_open','example_view') THEN
    UPDATE public.fleety_turn_signals
       SET chips_clicked = chips_clicked + 1
     WHERE id = p_turn_id;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fleety_record_action(UUID,TEXT,TEXT,TEXT) TO authenticated;

-- 8. RPC: nightly compute practical_score per turn
-- score = clamp01( 0.45 * has_action + 0.35 * thumbs_up - 0.35 * thumbs_down + 0.20 * has_playbook_or_canned )
CREATE OR REPLACE FUNCTION public.fleety_recompute_practical_scores(p_days INT DEFAULT 14)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  WITH agg AS (
    SELECT s.id,
           (CASE WHEN EXISTS(SELECT 1 FROM public.fleety_action_events e
                              WHERE e.turn_id = s.id
                                AND e.occurred_at <= s.created_at + INTERVAL '10 minutes') THEN 1 ELSE 0 END) AS has_action,
           COALESCE((SELECT SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) FROM public.fleety_message_feedback f WHERE f.turn_id = s.id),0) AS up,
           COALESCE((SELECT SUM(CASE WHEN rating=-1 THEN 1 ELSE 0 END) FROM public.fleety_message_feedback f WHERE f.turn_id = s.id),0) AS down,
           (CASE WHEN s.canned_answer_id IS NOT NULL OR s.playbook_hits > 0 THEN 1 ELSE 0 END) AS has_practical_source
    FROM public.fleety_turn_signals s
    WHERE s.created_at >= now() - (p_days || ' days')::interval
  )
  UPDATE public.fleety_turn_signals s
     SET practical_score = LEAST(1.0, GREATEST(0.0,
           0.45 * a.has_action
         + 0.35 * LEAST(a.up, 1)
         - 0.35 * LEAST(a.down, 1)
         + 0.20 * a.has_practical_source
       ))::numeric(4,3)
    FROM agg a
   WHERE s.id = a.id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fleety_recompute_practical_scores(INT) TO service_role;