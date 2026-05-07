
-- Enums
DO $$ BEGIN
  CREATE TYPE public.dsar_type AS ENUM ('access','portability','correction','erasure','restrict','object','appeal','human_review','withdraw_consent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dsar_status AS ENUM ('received','in_review','need_more_info','completed','denied','appealed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.incident_severity AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- cookie_consents
CREATE TABLE IF NOT EXISTS public.cookie_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL,
  anon_id TEXT NULL,
  ip_country TEXT NULL,
  gpc_signal BOOLEAN NOT NULL DEFAULT false,
  categories JSONB NOT NULL,
  policy_version TEXT NOT NULL,
  user_agent TEXT NULL,
  source TEXT NOT NULL DEFAULT 'banner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cookie_consents_user ON public.cookie_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_cookie_consents_anon ON public.cookie_consents(anon_id);
CREATE INDEX IF NOT EXISTS idx_cookie_consents_created ON public.cookie_consents(created_at DESC);

ALTER TABLE public.cookie_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consent_self_select" ON public.cookie_consents
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "consent_anon_or_self_insert" ON public.cookie_consents
  FOR INSERT TO anon, authenticated WITH CHECK (
    user_id IS NULL OR user_id = auth.uid()
  );

CREATE POLICY "consent_admin_select" ON public.cookie_consents
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- dsar_requests
CREATE TABLE IF NOT EXISTS public.dsar_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL,
  requester_email TEXT NOT NULL,
  type public.dsar_type NOT NULL,
  status public.dsar_status NOT NULL DEFAULT 'received',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  jurisdiction TEXT NULL,
  due_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL,
  decision_notes TEXT NULL,
  parent_request_id UUID NULL REFERENCES public.dsar_requests(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_dsar_user ON public.dsar_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_dsar_status ON public.dsar_requests(status);
CREATE INDEX IF NOT EXISTS idx_dsar_due ON public.dsar_requests(due_at);

ALTER TABLE public.dsar_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dsar_self_select" ON public.dsar_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "dsar_self_insert" ON public.dsar_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "dsar_admin_all" ON public.dsar_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- deleted_users_ledger
CREATE TABLE IF NOT EXISTS public.deleted_users_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_hash TEXT NOT NULL UNIQUE,
  jurisdiction TEXT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  purge_after TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 months')
);
ALTER TABLE public.deleted_users_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger_admin_only" ON public.deleted_users_ledger
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- incident_response
CREATE TABLE IF NOT EXISTS public.incident_response (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_by UUID NOT NULL,
  severity public.incident_severity NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  affected_user_count INTEGER NOT NULL DEFAULT 0,
  jurisdictions TEXT[] NOT NULL DEFAULT '{}',
  notification_due_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '72 hours'),
  notified_regulators_at TIMESTAMPTZ NULL,
  notified_users_at TIMESTAMPTZ NULL,
  resolved_at TIMESTAMPTZ NULL,
  draft_regulator_notice TEXT NULL,
  draft_user_notice TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.incident_response ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incident_admin_all" ON public.incident_response
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Helper: submit DSAR (used by edge function via service role; also callable by user for own requests)
CREATE OR REPLACE FUNCTION public.submit_dsar(
  _type public.dsar_type,
  _payload JSONB,
  _jurisdiction TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT email INTO v_email FROM public.profiles WHERE user_id = v_uid;
  INSERT INTO public.dsar_requests(user_id, requester_email, type, payload, jurisdiction)
  VALUES (v_uid, COALESCE(v_email,'unknown@unknown'), _type, COALESCE(_payload,'{}'::jsonb), _jurisdiction)
  RETURNING id INTO v_id;
  PERFORM public.write_audit_log('dsar_submitted','dsar_requests', v_id::text, v_uid, ARRAY[_type::text]);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_dsar(public.dsar_type,JSONB,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_dsar(public.dsar_type,JSONB,TEXT) TO authenticated;
