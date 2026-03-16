
-- Create enum for scenario implementation status
CREATE TYPE public.bdd_status AS ENUM ('implemented', 'partial', 'not_built');

-- Create enum for test type
CREATE TYPE public.bdd_test_type AS ENUM ('unit', 'e2e', 'both', 'none', 'manual');

-- Create the BDD scenarios tracking table
CREATE TABLE public.bdd_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_area text NOT NULL,
  feature_area_number int NOT NULL,
  scenario_id text NOT NULL UNIQUE,
  title text NOT NULL,
  gherkin text NOT NULL,
  status public.bdd_status NOT NULL DEFAULT 'not_built',
  test_type public.bdd_test_type NOT NULL DEFAULT 'none',
  test_file text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bdd_scenarios ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read scenarios
CREATE POLICY "Authenticated users can view scenarios"
  ON public.bdd_scenarios FOR SELECT TO authenticated
  USING (true);

-- Add updated_at trigger
CREATE TRIGGER update_bdd_scenarios_updated_at
  BEFORE UPDATE ON public.bdd_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
