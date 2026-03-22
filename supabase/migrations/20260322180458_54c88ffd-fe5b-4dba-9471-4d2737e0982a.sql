-- Cache table for explore AI responses keyed by normalized query
CREATE TABLE public.exploration_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_normalized text NOT NULL UNIQUE,
  response_markdown text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  hit_count integer NOT NULL DEFAULT 0
);

-- Anyone authenticated can read cache
ALTER TABLE public.exploration_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read exploration cache"
  ON public.exploration_cache FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert cache entries
CREATE POLICY "Authenticated users can insert exploration cache"
  ON public.exploration_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update hit count
CREATE POLICY "Authenticated users can update exploration cache"
  ON public.exploration_cache FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_exploration_cache_query ON public.exploration_cache (query_normalized);