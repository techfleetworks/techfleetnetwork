
CREATE OR REPLACE VIEW public.fleety_cost_daily AS
SELECT
  date_trunc('day', hour_bucket) AS day,
  SUM(turns)        AS turns,
  SUM(cache_hits)   AS cache_hits,
  SUM(canned_hits)  AS canned_hits,
  SUM(tokens_in)    AS tokens_in,
  SUM(tokens_out)   AS tokens_out,
  SUM(est_usd)::numeric(12,4) AS est_usd
FROM public.fleety_cost_counters
GROUP BY 1
ORDER BY 1 DESC;

REVOKE ALL ON public.fleety_cost_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fleety_cost_daily TO authenticated;

CREATE TABLE IF NOT EXISTS public.fleety_cost_guard_state (
  id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  mode            TEXT NOT NULL DEFAULT 'auto'
    CHECK (mode IN ('auto','force_off','force_soft','force_medium','force_hard')),
  soft_threshold   NUMERIC(8,2) NOT NULL DEFAULT 120,
  medium_threshold NUMERIC(8,2) NOT NULL DEFAULT 140,
  hard_threshold   NUMERIC(8,2) NOT NULL DEFAULT 170,
  notes            TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID
);
INSERT INTO public.fleety_cost_guard_state (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.fleety_cost_guard_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read fleety_cost_guard_state" ON public.fleety_cost_guard_state;
CREATE POLICY "Admins read fleety_cost_guard_state"
  ON public.fleety_cost_guard_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admins update fleety_cost_guard_state" ON public.fleety_cost_guard_state;
CREATE POLICY "Admins update fleety_cost_guard_state"
  ON public.fleety_cost_guard_state FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.fleety_cost_projection()
RETURNS TABLE (
  today_usd NUMERIC, yesterday_usd NUMERIC, last_7d_usd NUMERIC, last_30d_usd NUMERIC,
  projected_30d_usd NUMERIC, turns_today BIGINT,
  cache_hit_rate NUMERIC, canned_hit_rate NUMERIC,
  guard_step TEXT, guard_mode TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_state RECORD; v_today NUMERIC; v_yest NUMERIC; v_7d NUMERIC; v_30d NUMERIC;
  v_proj NUMERIC; v_turns_today BIGINT; v_cache_hits BIGINT; v_canned_hits BIGINT;
  v_total_turns BIGINT; v_step TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_state FROM public.fleety_cost_guard_state WHERE id = 1;

  SELECT COALESCE(SUM(est_usd),0), COALESCE(SUM(turns),0),
         COALESCE(SUM(cache_hits),0), COALESCE(SUM(canned_hits),0)
    INTO v_today, v_turns_today, v_cache_hits, v_canned_hits
    FROM public.fleety_cost_counters WHERE hour_bucket >= date_trunc('day', now());

  SELECT COALESCE(SUM(est_usd),0) INTO v_yest
    FROM public.fleety_cost_counters
    WHERE hour_bucket >= date_trunc('day', now() - interval '1 day')
      AND hour_bucket <  date_trunc('day', now());

  SELECT COALESCE(SUM(est_usd),0) INTO v_7d
    FROM public.fleety_cost_counters
    WHERE hour_bucket >= now() - interval '7 days';

  SELECT COALESCE(SUM(est_usd),0), COALESCE(SUM(turns),0) INTO v_30d, v_total_turns
    FROM public.fleety_cost_counters
    WHERE hour_bucket >= now() - interval '30 days';

  v_proj := round((v_7d / 7.0) * 30.0, 2);

  IF v_state.mode <> 'auto' THEN v_step := REPLACE(v_state.mode,'force_','');
  ELSIF v_proj >= v_state.hard_threshold   THEN v_step := 'hard';
  ELSIF v_proj >= v_state.medium_threshold THEN v_step := 'medium';
  ELSIF v_proj >= v_state.soft_threshold   THEN v_step := 'soft';
  ELSE v_step := 'none';
  END IF;

  RETURN QUERY SELECT
    round(v_today,4), round(v_yest,4), round(v_7d,4), round(v_30d,4), v_proj, v_turns_today,
    CASE WHEN v_total_turns>0 THEN round((v_cache_hits::numeric  / v_total_turns)*100,1) ELSE 0 END,
    CASE WHEN v_total_turns>0 THEN round((v_canned_hits::numeric / v_total_turns)*100,1) ELSE 0 END,
    v_step, v_state.mode;
END;$$;
REVOKE ALL ON FUNCTION public.fleety_cost_projection() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fleety_cost_projection() TO authenticated;

CREATE OR REPLACE FUNCTION public.fleety_cost_guard_step()
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_state RECORD; v_7d NUMERIC; v_proj NUMERIC;
BEGIN
  SELECT * INTO v_state FROM public.fleety_cost_guard_state WHERE id = 1;
  IF v_state.mode <> 'auto' THEN RETURN REPLACE(v_state.mode,'force_',''); END IF;
  SELECT COALESCE(SUM(est_usd),0) INTO v_7d
    FROM public.fleety_cost_counters WHERE hour_bucket >= now() - interval '7 days';
  v_proj := (v_7d / 7.0) * 30.0;
  IF v_proj >= v_state.hard_threshold   THEN RETURN 'hard';   END IF;
  IF v_proj >= v_state.medium_threshold THEN RETURN 'medium'; END IF;
  IF v_proj >= v_state.soft_threshold   THEN RETURN 'soft';   END IF;
  RETURN 'none';
END;$$;
REVOKE ALL ON FUNCTION public.fleety_cost_guard_step() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fleety_cost_guard_step() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fleety_top_expensive_turns(_limit INT DEFAULT 10)
RETURNS TABLE (user_query TEXT, hits BIGINT, est_usd NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT s.user_query, count(*)::bigint AS hits,
           round((count(*) * 0.005)::numeric, 4) AS est_usd
      FROM public.fleety_turn_signals s
      WHERE s.created_at >= now() - interval '7 days' AND s.user_query IS NOT NULL
      GROUP BY s.user_query
      ORDER BY hits DESC
      LIMIT GREATEST(1, LEAST(_limit, 50));
END;$$;
REVOKE ALL ON FUNCTION public.fleety_top_expensive_turns(INT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fleety_top_expensive_turns(INT) TO authenticated;

INSERT INTO public.bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin, status)
VALUES
('Fleety Cost Controls', 31, 'F-COST-007',
 'Cost guard engages when 30-day projection exceeds soft threshold',
$g$Feature: Fleety cost guard
  Scenario: Soft step engages above $120 projection
    Given the 7-day est_usd extrapolated to 30 days exceeds $120
    And the guard mode is "auto"
    When fleety_cost_guard_step() is called
    Then [Code] it returns "soft"
    And [DB] fleety_cost_guard_state.mode remains "auto"
    And [UI] System Health > Fleety shows the orange "Soft cost guard active" banner$g$,
 'not_built'),
('Fleety Cost Controls', 31, 'F-COST-008',
 'Admin can force the cost guard off',
$g$Feature: Fleety cost guard override
  Scenario: Admin sets mode to force_off
    Given an admin updates fleety_cost_guard_state.mode to "force_off"
    When the next chat turn calls fleety_cost_guard_step()
    Then [Code] it returns "none"
    And [DB] guard_mode in fleety_cost_projection() returns "force_off"
    And [UI] the banner shows "Cost guard manually disabled"$g$,
 'not_built'),
('Fleety Cost Controls', 31, 'F-COST-009',
 'Cost projection visible to admins only',
$g$Feature: Fleety cost projection RLS
  Scenario: Non-admin cannot read projection
    Given a member calls fleety_cost_projection()
    Then [Code] the call raises permission_denied (SQLSTATE 42501)
    And [DB] fleety_cost_counters rows are unreadable to the member
    And [UI] the Fleety cost panel is hidden from the member's System Health view$g$,
 'not_built')
ON CONFLICT (scenario_id) DO NOTHING;
