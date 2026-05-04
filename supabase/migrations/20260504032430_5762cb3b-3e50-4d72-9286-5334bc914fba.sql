
-- ============================================================
-- Fleety Cost Plan v2 — Phase 1: Foundations
-- ============================================================

-- 1. KB version singleton (drives semantic-cache invalidation)
CREATE TABLE IF NOT EXISTS public.fleety_kb_version (
  id boolean PRIMARY KEY DEFAULT true,
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleety_kb_version_singleton CHECK (id = true)
);
INSERT INTO public.fleety_kb_version (id, version) VALUES (true, 1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.fleety_kb_version ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_version readable to authenticated"
  ON public.fleety_kb_version FOR SELECT
  TO authenticated USING (true);

-- Bump helper: called by ingest jobs and admin content edits.
CREATE OR REPLACE FUNCTION public.bump_kb_version()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v bigint;
BEGIN
  UPDATE public.fleety_kb_version
     SET version = version + 1, updated_at = now()
   WHERE id = true
   RETURNING version INTO v;
  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_kb_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_kb_version() TO service_role;

-- 2. Semantic response cache
-- vector extension lives in `extensions` schema per security hardening pass.
CREATE TABLE IF NOT EXISTS public.fleety_response_cache (
  query_hash text PRIMARY KEY,
  query_text text NOT NULL,
  query_embedding extensions.vector(1536),
  audience text NOT NULL DEFAULT 'member',
  kb_version bigint NOT NULL,
  response_md text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  tier text NOT NULL DEFAULT 'B',
  hits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fleety_response_cache_audience_version
  ON public.fleety_response_cache (audience, kb_version);
CREATE INDEX IF NOT EXISTS idx_fleety_response_cache_last_used
  ON public.fleety_response_cache (last_used_at DESC);
-- IVFFlat ANN index for semantic fallback lookup
CREATE INDEX IF NOT EXISTS idx_fleety_response_cache_embedding
  ON public.fleety_response_cache
  USING ivfflat (query_embedding extensions.vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.fleety_response_cache ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies; service-role bypasses RLS.

-- 3. Hourly cost counters (one row per hour bucket per model)
CREATE TABLE IF NOT EXISTS public.fleety_cost_counters (
  hour_bucket timestamptz NOT NULL,
  model text NOT NULL,
  tier text NOT NULL DEFAULT 'B',
  tokens_in bigint NOT NULL DEFAULT 0,
  tokens_out bigint NOT NULL DEFAULT 0,
  est_usd numeric(12,6) NOT NULL DEFAULT 0,
  turns integer NOT NULL DEFAULT 0,
  cache_hits integer NOT NULL DEFAULT 0,
  canned_hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (hour_bucket, model, tier)
);
CREATE INDEX IF NOT EXISTS idx_fleety_cost_counters_hour
  ON public.fleety_cost_counters (hour_bucket DESC);

ALTER TABLE public.fleety_cost_counters ENABLE ROW LEVEL SECURITY;

-- Admins (and only admins) can read cost counters.
CREATE POLICY "Admins read fleety_cost_counters"
  ON public.fleety_cost_counters FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Per-user quota views
-- Counts the user's Fleety turns from existing fleety_turn_signals table.
CREATE OR REPLACE VIEW public.fleety_user_quota_daily AS
SELECT
  user_id,
  count(*)::int AS turns_today
FROM public.fleety_turn_signals
WHERE user_id IS NOT NULL
  AND created_at >= date_trunc('day', now())
GROUP BY user_id;

CREATE OR REPLACE VIEW public.fleety_user_quota_monthly AS
SELECT
  user_id,
  count(*)::int AS turns_this_month
FROM public.fleety_turn_signals
WHERE user_id IS NOT NULL
  AND created_at >= date_trunc('month', now())
GROUP BY user_id;

-- 5. Quota check RPC (returns allowed + remaining counts)
CREATE OR REPLACE FUNCTION public.check_fleety_user_quota(_user_id uuid)
RETURNS TABLE (
  allowed boolean,
  reason text,
  daily_used int,
  daily_limit int,
  monthly_used int,
  monthly_limit int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  daily_cap int := 30;
  monthly_cap int := 150;
  d int := 0;
  m int := 0;
BEGIN
  SELECT COALESCE(turns_today, 0) INTO d
    FROM public.fleety_user_quota_daily WHERE user_id = _user_id;
  SELECT COALESCE(turns_this_month, 0) INTO m
    FROM public.fleety_user_quota_monthly WHERE user_id = _user_id;

  IF m >= monthly_cap THEN
    RETURN QUERY SELECT false, 'monthly_cap'::text, d, daily_cap, m, monthly_cap;
    RETURN;
  END IF;
  IF d >= daily_cap THEN
    RETURN QUERY SELECT false, 'daily_cap'::text, d, daily_cap, m, monthly_cap;
    RETURN;
  END IF;
  RETURN QUERY SELECT true, NULL::text, d, daily_cap, m, monthly_cap;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_fleety_user_quota(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_fleety_user_quota(uuid) TO service_role;

-- 6. Cache write/read helpers (kept SQL-only so the edge fn stays simple)
CREATE OR REPLACE FUNCTION public.fleety_cache_lookup(
  _query_hash text,
  _audience text
)
RETURNS TABLE (
  response_md text,
  sources jsonb,
  tier text,
  kb_version bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_v bigint;
BEGIN
  SELECT version INTO current_v FROM public.fleety_kb_version WHERE id = true;

  RETURN QUERY
  UPDATE public.fleety_response_cache c
     SET hits = hits + 1, last_used_at = now()
   WHERE c.query_hash = _query_hash
     AND c.audience = _audience
     AND c.kb_version = current_v
     AND c.last_used_at >= now() - interval '7 days'
  RETURNING c.response_md, c.sources, c.tier, c.kb_version;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fleety_cache_lookup(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleety_cache_lookup(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.fleety_cache_store(
  _query_hash text,
  _query_text text,
  _audience text,
  _response_md text,
  _sources jsonb,
  _tier text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_v bigint;
BEGIN
  SELECT version INTO current_v FROM public.fleety_kb_version WHERE id = true;

  INSERT INTO public.fleety_response_cache
    (query_hash, query_text, audience, kb_version, response_md, sources, tier)
  VALUES
    (_query_hash, _query_text, _audience, current_v, _response_md, _sources, _tier)
  ON CONFLICT (query_hash) DO UPDATE
    SET response_md = EXCLUDED.response_md,
        sources     = EXCLUDED.sources,
        tier        = EXCLUDED.tier,
        kb_version  = EXCLUDED.kb_version,
        last_used_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fleety_cache_store(text, text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleety_cache_store(text, text, text, text, jsonb, text) TO service_role;

-- 7. Cost counter write helper (atomic upsert)
CREATE OR REPLACE FUNCTION public.fleety_record_cost(
  _model text,
  _tier text,
  _tokens_in bigint,
  _tokens_out bigint,
  _est_usd numeric,
  _cache_hit boolean,
  _canned_hit boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.fleety_cost_counters
    (hour_bucket, model, tier, tokens_in, tokens_out, est_usd, turns, cache_hits, canned_hits)
  VALUES
    (date_trunc('hour', now()), _model, _tier, _tokens_in, _tokens_out, _est_usd, 1,
     CASE WHEN _cache_hit THEN 1 ELSE 0 END,
     CASE WHEN _canned_hit THEN 1 ELSE 0 END)
  ON CONFLICT (hour_bucket, model, tier) DO UPDATE
    SET tokens_in   = public.fleety_cost_counters.tokens_in + EXCLUDED.tokens_in,
        tokens_out  = public.fleety_cost_counters.tokens_out + EXCLUDED.tokens_out,
        est_usd     = public.fleety_cost_counters.est_usd + EXCLUDED.est_usd,
        turns       = public.fleety_cost_counters.turns + 1,
        cache_hits  = public.fleety_cost_counters.cache_hits + EXCLUDED.cache_hits,
        canned_hits = public.fleety_cost_counters.canned_hits + EXCLUDED.canned_hits;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fleety_record_cost(text, text, bigint, bigint, numeric, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleety_record_cost(text, text, bigint, bigint, numeric, boolean, boolean) TO service_role;
