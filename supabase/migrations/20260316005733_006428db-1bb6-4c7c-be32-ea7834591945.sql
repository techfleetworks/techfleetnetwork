
-- Handbooks table
CREATE TABLE public.handbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  target_audience text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Operations',
  contents text[] NOT NULL DEFAULT '{}',
  link text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Workshops table
CREATE TABLE public.workshops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Operations',
  description text NOT NULL DEFAULT '',
  figma_link text NOT NULL DEFAULT '',
  led_by text NOT NULL DEFAULT '',
  deliverables text NOT NULL DEFAULT '',
  accountable_function text NOT NULL DEFAULT '',
  functions_involved text[] NOT NULL DEFAULT '{}',
  stakeholders text[] NOT NULL DEFAULT '{}',
  timing text NOT NULL DEFAULT '',
  milestones text NOT NULL DEFAULT '',
  project_types text[] NOT NULL DEFAULT '{}',
  skills text[] NOT NULL DEFAULT '{}',
  company_types text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.handbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshops ENABLE ROW LEVEL SECURITY;

-- Public read access (resources are viewable by all authenticated users)
CREATE POLICY "Authenticated users can view handbooks"
  ON public.handbooks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view workshops"
  ON public.workshops FOR SELECT
  TO authenticated
  USING (true);

-- Updated_at triggers
CREATE TRIGGER update_handbooks_updated_at
  BEFORE UPDATE ON public.handbooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workshops_updated_at
  BEFORE UPDATE ON public.workshops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
