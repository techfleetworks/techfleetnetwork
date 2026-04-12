
-- Step type enum
CREATE TYPE public.quest_step_type AS ENUM ('course', 'self_report', 'system_verified', 'application');

-- Quest paths table
CREATE TABLE public.quest_paths (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT 'beginner',
  icon TEXT NOT NULL DEFAULT 'circle',
  sort_order INTEGER NOT NULL DEFAULT 0,
  estimated_duration TEXT NOT NULL DEFAULT '',
  duration_phases JSONB NOT NULL DEFAULT '[]'::jsonb,
  prerequisites TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quest_paths ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view quest paths"
ON public.quest_paths FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage quest paths"
ON public.quest_paths FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Quest path steps table
CREATE TABLE public.quest_path_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  path_id UUID NOT NULL REFERENCES public.quest_paths(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  step_type public.quest_step_type NOT NULL DEFAULT 'self_report',
  sort_order INTEGER NOT NULL DEFAULT 0,
  linked_phase TEXT,
  linked_table TEXT,
  linked_filter JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quest_path_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view quest path steps"
ON public.quest_path_steps FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage quest path steps"
ON public.quest_path_steps FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- User quest selections table (tracks which paths users have added)
CREATE TABLE public.user_quest_selections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  path_id UUID NOT NULL REFERENCES public.quest_paths(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, path_id)
);

ALTER TABLE public.user_quest_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own quest selections"
ON public.user_quest_selections FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own quest selections"
ON public.user_quest_selections FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own quest selections"
ON public.user_quest_selections FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own quest selections"
ON public.user_quest_selections FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage quest selections"
ON public.user_quest_selections FOR ALL TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Indexes
CREATE INDEX idx_quest_path_steps_path_id ON public.quest_path_steps(path_id);
CREATE INDEX idx_user_quest_selections_user_id ON public.user_quest_selections(user_id);
CREATE INDEX idx_quest_paths_sort_order ON public.quest_paths(sort_order);

-- Timestamps triggers
CREATE TRIGGER update_quest_paths_updated_at
BEFORE UPDATE ON public.quest_paths
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_quest_path_steps_updated_at
BEFORE UPDATE ON public.quest_path_steps
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_quest_selections_updated_at
BEFORE UPDATE ON public.user_quest_selections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add to user deletion cascade
CREATE OR REPLACE FUNCTION public.handle_user_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.user_quest_selections WHERE user_id = OLD.id;
  DELETE FROM public.push_subscriptions WHERE user_id = OLD.id;
  DELETE FROM public.chat_messages WHERE conversation_id IN (
    SELECT id FROM public.chat_conversations WHERE user_id = OLD.id
  );
  DELETE FROM public.chat_conversations WHERE user_id = OLD.id;
  DELETE FROM public.journey_progress WHERE user_id = OLD.id;
  DELETE FROM public.announcement_reads WHERE user_id = OLD.id;
  DELETE FROM public.dashboard_preferences WHERE user_id = OLD.id;
  DELETE FROM public.grid_view_states WHERE user_id = OLD.id;
  DELETE FROM public.project_applications WHERE user_id = OLD.id;
  DELETE FROM public.general_applications WHERE user_id = OLD.id;
  DELETE FROM public.admin_promotions WHERE user_id = OLD.id;
  DELETE FROM public.user_roles WHERE user_id = OLD.id;
  DELETE FROM public.notifications WHERE user_id = OLD.id;
  DELETE FROM public.feedback WHERE user_id = OLD.id;
  DELETE FROM public.audit_log WHERE user_id = OLD.id;
  DELETE FROM public.profiles WHERE user_id = OLD.id;
  RETURN OLD;
END;
$$;
