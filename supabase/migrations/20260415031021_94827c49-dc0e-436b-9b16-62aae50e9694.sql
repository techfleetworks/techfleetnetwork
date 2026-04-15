
-- Banner status enum
CREATE TYPE public.banner_status AS ENUM ('draft', 'published', 'archived');

-- Admin banners table
CREATE TABLE public.admin_banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  status public.banner_status NOT NULL DEFAULT 'draft',
  reopen_after_dismiss BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage banners" ON public.admin_banners
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view published banners" ON public.admin_banners
  FOR SELECT TO authenticated
  USING (status = 'published');

-- Trigger for updated_at
CREATE TRIGGER update_admin_banners_updated_at
  BEFORE UPDATE ON public.admin_banners
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Banner dismissals table
CREATE TABLE public.banner_dismissals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  banner_id UUID NOT NULL REFERENCES public.admin_banners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  dismissed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (banner_id, user_id)
);

ALTER TABLE public.banner_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dismissals" ON public.banner_dismissals
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dismissals" ON public.banner_dismissals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own dismissals" ON public.banner_dismissals
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Index for fast lookup
CREATE INDEX idx_banner_dismissals_user ON public.banner_dismissals (user_id);
CREATE INDEX idx_admin_banners_status ON public.admin_banners (status);
