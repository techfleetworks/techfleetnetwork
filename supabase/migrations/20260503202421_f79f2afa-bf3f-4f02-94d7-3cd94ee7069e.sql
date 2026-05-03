
CREATE EXTENSION IF NOT EXISTS vector;

-- Embedding columns
ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS embedding vector(768),
  ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz;

ALTER TABLE public.fleety_playbooks
  ADD COLUMN IF NOT EXISTS embedding vector(768),
  ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz;

ALTER TABLE public.fleety_examples
  ADD COLUMN IF NOT EXISTS embedding vector(768),
  ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz;

-- IVFFlat indexes (cosine). lists kept low because row counts are modest.
CREATE INDEX IF NOT EXISTS idx_kb_embedding
  ON public.knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX IF NOT EXISTS idx_playbooks_embedding
  ON public.fleety_playbooks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 25);
CREATE INDEX IF NOT EXISTS idx_examples_embedding
  ON public.fleety_examples USING ivfflat (embedding vector_cosine_ops) WITH (lists = 25);

-- Top-K KB semantic search
CREATE OR REPLACE FUNCTION public.fleety_kb_semantic_search(
  p_query_embedding vector(768),
  p_limit int DEFAULT 12
)
RETURNS TABLE(id uuid, url text, title text, content text, similarity numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT k.id, k.url, k.title, k.content,
         (1 - (k.embedding <=> p_query_embedding))::numeric AS similarity
  FROM public.knowledge_base k
  WHERE k.embedding IS NOT NULL
  ORDER BY k.embedding <=> p_query_embedding
  LIMIT p_limit;
$$;

-- Semantic playbook match
CREATE OR REPLACE FUNCTION public.fleety_match_playbooks_semantic(
  p_query_embedding vector(768),
  p_audience text DEFAULT 'all',
  p_limit int DEFAULT 3
)
RETURNS TABLE(id uuid, slug text, title text, intent text, direct_answer text,
              steps jsonb, done_criteria text[], common_pitfalls text[],
              ask_for_help text, example_artifact_url text, action_chips jsonb,
              similarity numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.slug, p.title, p.intent, p.direct_answer, p.steps,
         p.done_criteria, p.common_pitfalls, p.ask_for_help, p.example_artifact_url, p.action_chips,
         (1 - (p.embedding <=> p_query_embedding))::numeric AS similarity
  FROM public.fleety_playbooks p
  WHERE p.is_active
    AND p.embedding IS NOT NULL
    AND (p.audience = 'all' OR p.audience = p_audience)
  ORDER BY p.embedding <=> p_query_embedding
  LIMIT p_limit;
$$;

-- Semantic example match
CREATE OR REPLACE FUNCTION public.fleety_match_examples_semantic(
  p_query_embedding vector(768),
  p_limit int DEFAULT 2
)
RETURNS TABLE(id uuid, slug text, title text, deliverable_type text, summary text,
              excerpt text, source_url text, similarity numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.slug, e.title, e.deliverable_type, e.summary, e.excerpt, e.source_url,
         (1 - (e.embedding <=> p_query_embedding))::numeric AS similarity
  FROM public.fleety_examples e
  WHERE e.is_active
    AND e.embedding IS NOT NULL
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT p_limit;
$$;

-- Intent-based fallback when semantic + trigram both miss
CREATE OR REPLACE FUNCTION public.fleety_playbooks_by_intent(
  p_intent text,
  p_audience text DEFAULT 'all',
  p_limit int DEFAULT 2
)
RETURNS TABLE(id uuid, slug text, title text, intent text, direct_answer text,
              steps jsonb, done_criteria text[], common_pitfalls text[],
              ask_for_help text, example_artifact_url text, action_chips jsonb,
              similarity numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.slug, p.title, p.intent, p.direct_answer, p.steps,
         p.done_criteria, p.common_pitfalls, p.ask_for_help, p.example_artifact_url, p.action_chips,
         0.0::numeric AS similarity
  FROM public.fleety_playbooks p
  WHERE p.is_active
    AND p.intent = p_intent
    AND (p.audience = 'all' OR p.audience = p_audience)
  ORDER BY p.updated_at DESC
  LIMIT p_limit;
$$;

-- Mark everything as needing backfill
UPDATE public.knowledge_base SET embedding_updated_at = NULL WHERE embedding IS NULL;
UPDATE public.fleety_playbooks SET embedding_updated_at = NULL WHERE embedding IS NULL;
UPDATE public.fleety_examples SET embedding_updated_at = NULL WHERE embedding IS NULL;
