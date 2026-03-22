
CREATE TABLE public.exploration_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  query_text text NOT NULL,
  result_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.exploration_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own exploration queries"
  ON public.exploration_queries
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can view all exploration queries"
  ON public.exploration_queries
  FOR SELECT TO authenticated
  USING (true);

CREATE INDEX idx_exploration_queries_created_at ON public.exploration_queries (created_at DESC);
