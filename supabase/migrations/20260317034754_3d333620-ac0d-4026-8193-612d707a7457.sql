-- Create general_applications table
CREATE TABLE public.general_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  title text NOT NULL DEFAULT 'General Application',
  about_yourself text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add updated_at trigger
CREATE TRIGGER update_general_applications_updated_at
  BEFORE UPDATE ON public.general_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.general_applications ENABLE ROW LEVEL SECURITY;

-- Users can view their own applications
CREATE POLICY "Users can view own general applications"
  ON public.general_applications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own applications
CREATE POLICY "Users can insert own general applications"
  ON public.general_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own applications
CREATE POLICY "Users can update own general applications"
  ON public.general_applications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can delete their own applications
CREATE POLICY "Users can delete own general applications"
  ON public.general_applications
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);