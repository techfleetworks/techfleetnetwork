
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_month smallint CHECK (birth_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS birth_day smallint CHECK (birth_day BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS guardian_email text,
  ADD COLUMN IF NOT EXISTS guardian_consent_token text,
  ADD COLUMN IF NOT EXISTS guardian_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS electronic_comms_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS country_code_at_signup text;

CREATE TABLE IF NOT EXISTS public.policy_versions (
  policy_key text NOT NULL,
  version text NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  checksum text NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (policy_key, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS policy_versions_current_uq
  ON public.policy_versions (policy_key) WHERE is_current;
ALTER TABLE public.policy_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "policy_versions readable by all" ON public.policy_versions FOR SELECT USING (true);
CREATE POLICY "policy_versions admin write" ON public.policy_versions FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.policy_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  anon_id text,
  policy_key text NOT NULL,
  version text NOT NULL,
  method text NOT NULL CHECK (method IN ('checkbox','google-oauth','re-accept','registration')),
  ip inet,
  user_agent text,
  electronic_comms_consent boolean NOT NULL DEFAULT false,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS policy_ack_user_idx ON public.policy_acknowledgments (user_id, policy_key);
ALTER TABLE public.policy_acknowledgments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ack self read" ON public.policy_acknowledgments
  FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
REVOKE INSERT, UPDATE, DELETE ON public.policy_acknowledgments FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.recording_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_ref text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('this-session','future-uses')),
  granted boolean NOT NULL DEFAULT true,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text
);
ALTER TABLE public.recording_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rec self read" ON public.recording_consents
  FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "rec self insert" ON public.recording_consents
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "rec self revoke" ON public.recording_consents
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.sanctions_screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  country_code text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('allow','deny')),
  list_version text NOT NULL,
  reason text,
  ip inet,
  screened_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sanctions_screenings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sanctions admin read" ON public.sanctions_screenings
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
REVOKE INSERT, UPDATE, DELETE ON public.sanctions_screenings FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.dispute_intake (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  full_name text,
  summary text NOT NULL CHECK (length(summary) BETWEEN 20 AND 8000),
  category text,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution_note text
);
CREATE INDEX IF NOT EXISTS dispute_open_idx ON public.dispute_intake (created_at) WHERE resolved_at IS NULL;
ALTER TABLE public.dispute_intake ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispute admin read" ON public.dispute_intake
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "dispute admin update" ON public.dispute_intake
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
REVOKE INSERT, DELETE ON public.dispute_intake FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.dpa_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  signed_by_name text NOT NULL,
  signed_by_email text NOT NULL,
  signed_by_title text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  ip inet,
  pdf_storage_path text,
  version text NOT NULL DEFAULT '2026-05-08',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.dpa_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dpa admin all" ON public.dpa_executions FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.record_policy_ack(
  p_policy_keys text[], p_version text, p_method text, p_ip inet, p_user_agent text,
  p_electronic_comms boolean, p_anon_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text;
BEGIN
  IF p_method NOT IN ('checkbox','google-oauth','re-accept','registration') THEN
    RAISE EXCEPTION 'invalid method';
  END IF;
  FOREACH k IN ARRAY p_policy_keys LOOP
    INSERT INTO public.policy_acknowledgments
      (user_id, anon_id, policy_key, version, method, ip, user_agent, electronic_comms_consent)
    VALUES (auth.uid(), p_anon_id, k, p_version, p_method, p_ip, p_user_agent, COALESCE(p_electronic_comms,false));
  END LOOP;
  IF auth.uid() IS NOT NULL AND COALESCE(p_electronic_comms,false) THEN
    UPDATE public.profiles SET electronic_comms_consent_at = COALESCE(electronic_comms_consent_at, now())
     WHERE id = auth.uid();
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.record_policy_ack(text[],text,text,inet,text,boolean,text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.record_sanctions_screening(
  p_email text, p_country text, p_decision text, p_list_version text, p_reason text, p_ip inet
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.sanctions_screenings (user_id, email, country_code, decision, list_version, reason, ip)
  VALUES (auth.uid(), p_email, upper(p_country), p_decision, p_list_version, p_reason, p_ip)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_sanctions_screening(text,text,text,text,text,inet) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.submit_dispute(
  p_email text, p_full_name text, p_summary text, p_category text, p_ip inet
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF length(p_summary) < 20 THEN RAISE EXCEPTION 'summary too short'; END IF;
  INSERT INTO public.dispute_intake (user_id, email, full_name, summary, category, ip)
  VALUES (auth.uid(), p_email, p_full_name, p_summary, p_category, p_ip)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.submit_dispute(text,text,text,text,inet) TO authenticated, anon;

INSERT INTO public.policy_versions (policy_key, version, checksum, is_current) VALUES
  ('terms-and-conditions','2026-05-07','seed',true),
  ('terms-of-use','2026-05-07','seed',true),
  ('privacy','2026-05-07','seed',true),
  ('cookies','2026-05-07','seed',true),
  ('accessibility','2026-05-07','seed',true),
  ('code-of-conduct','2026-05-08','seed',true)
ON CONFLICT (policy_key, version) DO NOTHING;
