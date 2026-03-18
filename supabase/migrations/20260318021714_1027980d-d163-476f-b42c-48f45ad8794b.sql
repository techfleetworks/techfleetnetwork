
CREATE TABLE public.grid_view_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  grid_id text NOT NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, grid_id)
);

ALTER TABLE public.grid_view_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own grid states"
  ON public.grid_view_states FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own grid states"
  ON public.grid_view_states FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own grid states"
  ON public.grid_view_states FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own grid states"
  ON public.grid_view_states FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
