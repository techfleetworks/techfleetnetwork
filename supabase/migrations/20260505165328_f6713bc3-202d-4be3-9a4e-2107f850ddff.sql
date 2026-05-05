
CREATE TABLE public.observer_role_optins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  opted_in_at timestamptz NOT NULL DEFAULT now(),
  discord_user_id text NOT NULL,
  projects_role_granted_at timestamptz,
  observers_role_granted_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.observer_role_optins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own observer opt-in"
  ON public.observer_role_optins FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all observer opt-ins"
  ON public.observer_role_optins FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- No INSERT/UPDATE/DELETE policies = client writes denied; service role bypasses RLS.

CREATE OR REPLACE FUNCTION public.observer_role_optin_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'observer_role_optins.user_id is immutable';
  END IF;
  IF NEW.discord_user_id IS DISTINCT FROM OLD.discord_user_id THEN
    RAISE EXCEPTION 'observer_role_optins.discord_user_id is immutable';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_observer_role_optin_immutable
  BEFORE UPDATE ON public.observer_role_optins
  FOR EACH ROW EXECUTE FUNCTION public.observer_role_optin_immutable_fields();
