
CREATE TABLE IF NOT EXISTS public.teacher_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  promoted_by UUID NOT NULL,
  token TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  token_hash TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teacher_promotions_user ON public.teacher_promotions(user_id);
CREATE INDEX IF NOT EXISTS idx_teacher_promotions_token ON public.teacher_promotions(token);

ALTER TABLE public.teacher_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can insert teacher promotions" ON public.teacher_promotions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() <> user_id);

CREATE POLICY "Admins can view all teacher promotions" ON public.teacher_promotions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own teacher promotions" ON public.teacher_promotions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
