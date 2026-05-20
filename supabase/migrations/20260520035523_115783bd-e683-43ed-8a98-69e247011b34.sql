-- ============================================================
-- Enterprise stats v4 — SQL source of truth
-- ============================================================

-- 1. profiles.is_test_account
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_profiles_not_test ON public.profiles(user_id) WHERE NOT is_test_account;

UPDATE public.profiles p
SET is_test_account = true
WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = 'admin')
   OR p.email ILIKE '%+test@%'
   OR p.email ILIKE '%@example.%';

-- 2. CATALOG TABLES
CREATE TABLE IF NOT EXISTS public.course_catalog (
  course_key text PRIMARY KEY,
  phase journey_phase NOT NULL,
  tier text NOT NULL CHECK (tier IN ('onboarding','core','project','advanced')),
  display_label text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lesson_catalog (
  lesson_id text PRIMARY KEY,
  course_key text NOT NULL REFERENCES public.course_catalog(course_key) ON DELETE CASCADE,
  phase journey_phase NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lesson_catalog_course ON public.lesson_catalog(course_key) WHERE active AND required;
CREATE INDEX IF NOT EXISTS idx_lesson_catalog_phase ON public.lesson_catalog(phase);

INSERT INTO public.course_catalog (course_key, phase, tier, display_label, display_order) VALUES
('connect-discord','first_steps','onboarding','Connect Discord',1),
('onboarding','first_steps','onboarding','First Steps Onboarding',2),
('agile-mindset','second_steps','core','Agile Mindset',3),
('observer-course','observer','core','Observer Course',4),
('agile-teamwork','third_steps','core','Agile Teamwork',5),
('project-training','project_training','core','Project Training',6),
('volunteer-teams','volunteer','core','Volunteer Teams',7),
('discord-learning','discord_learning','core','Discord Learning',8)
ON CONFLICT (course_key) DO UPDATE SET
  phase = EXCLUDED.phase, tier = EXCLUDED.tier,
  display_label = EXCLUDED.display_label, display_order = EXCLUDED.display_order,
  updated_at = now();

INSERT INTO public.lesson_catalog (lesson_id, course_key, phase, display_order) VALUES
('connect-discord','connect-discord','first_steps',1),
('community-agreement','onboarding','first_steps',1),
('terms-conditions','onboarding','first_steps',2),
('terms-of-use','onboarding','first_steps',3),
('privacy-policy','onboarding','first_steps',4),
('cookie-policy','onboarding','first_steps',5),
('profile','onboarding','first_steps',6),
('onboarding-class','onboarding','first_steps',7),
('figma-account','onboarding','first_steps',8),
('agile-intro-1','agile-mindset','second_steps',1),
('agile-intro-2','agile-mindset','second_steps',2),
('agile-intro-3','agile-mindset','second_steps',3),
('agile-phil-1','agile-mindset','second_steps',4),
('agile-phil-2','agile-mindset','second_steps',5),
('agile-phil-3','agile-mindset','second_steps',6),
('agile-phil-4','agile-mindset','second_steps',7),
('agile-team-1','agile-mindset','second_steps',8),
('agile-team-2','agile-mindset','second_steps',9),
('agile-team-3','agile-mindset','second_steps',10),
('agile-prac-1','agile-mindset','second_steps',11),
('agile-prac-2','agile-mindset','second_steps',12),
('agile-prac-3','agile-mindset','second_steps',13),
('agile-prac-4','agile-mindset','second_steps',14),
('agile-prac-5','agile-mindset','second_steps',15),
('agile-cross-1','agile-mindset','second_steps',16),
('agile-cross-2','agile-mindset','second_steps',17),
('agile-cross-3','agile-mindset','second_steps',18),
('agile-conflict-1','agile-mindset','second_steps',19),
('agile-conflict-2','agile-mindset','second_steps',20),
('agile-conflict-3','agile-mindset','second_steps',21),
('agile-method-1','agile-mindset','second_steps',22),
('agile-method-2','agile-mindset','second_steps',23),
('agile-method-3','agile-mindset','second_steps',24),
('agile-method-4','agile-mindset','second_steps',25),
('obs-1','observer-course','observer',1),
('obs-2','observer-course','observer',2),
('obs-3','observer-course','observer',3),
('obs-4','observer-course','observer',4),
('obs-5','observer-course','observer',5),
('obs-6','observer-course','observer',6),
('obs-7','observer-course','observer',7),
('obs-8','observer-course','observer',8),
('tw-intro-1','agile-teamwork','third_steps',1),
('tw-intro-2','agile-teamwork','third_steps',2),
('tw-intro-3','agile-teamwork','third_steps',3),
('tw-intro-4','agile-teamwork','third_steps',4),
('tw-learn-1','agile-teamwork','third_steps',5),
('tw-learn-2','agile-teamwork','third_steps',6),
('tw-expect-1','agile-teamwork','third_steps',7),
('tw-expect-2','agile-teamwork','third_steps',8),
('tw-expect-3','agile-teamwork','third_steps',9),
('tw-expect-4','agile-teamwork','third_steps',10),
('tw-expect-5','agile-teamwork','third_steps',11),
('tw-expect-6','agile-teamwork','third_steps',12),
('pt-intro-1','project-training','project_training',1),
('pt-intro-2','project-training','project_training',2),
('pt-intro-3','project-training','project_training',3),
('pt-intro-4','project-training','project_training',4),
('pt-apply-1','project-training','project_training',5),
('pt-apply-2','project-training','project_training',6),
('pt-apply-3','project-training','project_training',7),
('pt-apply-4','project-training','project_training',8),
('pt-apply-5','project-training','project_training',9),
('pt-apply-6','project-training','project_training',10),
('pt-apply-7','project-training','project_training',11),
('pt-tips-1','project-training','project_training',12),
('pt-tips-2','project-training','project_training',13),
('pt-tips-3','project-training','project_training',14),
('vt-intro-1','volunteer-teams','volunteer',1),
('vt-intro-2','volunteer-teams','volunteer',2),
('vt-work-1','volunteer-teams','volunteer',3),
('vt-work-2','volunteer-teams','volunteer',4),
('vt-work-3','volunteer-teams','volunteer',5),
('vt-work-4','volunteer-teams','volunteer',6),
('discord-intro-1','discord-learning','discord_learning',1),
('discord-start-1','discord-learning','discord_learning',2),
('discord-start-2','discord-learning','discord_learning',3),
('discord-start-3','discord-learning','discord_learning',4),
('discord-security-1','discord-learning','discord_learning',5),
('discord-security-2','discord-learning','discord_learning',6),
('discord-security-3','discord-learning','discord_learning',7),
('discord-interact-1','discord-learning','discord_learning',8),
('discord-interact-2','discord-learning','discord_learning',9),
('discord-interact-3','discord-learning','discord_learning',10),
('discord-interact-4','discord-learning','discord_learning',11),
('discord-interact-5','discord-learning','discord_learning',12),
('discord-roles-1','discord-learning','discord_learning',13),
('discord-roles-2','discord-learning','discord_learning',14),
('discord-training-1','discord-learning','discord_learning',15),
('discord-training-2','discord-learning','discord_learning',16),
('discord-training-3','discord-learning','discord_learning',17),
('discord-training-4','discord-learning','discord_learning',18),
('discord-support-1','discord-learning','discord_learning',19)
ON CONFLICT (lesson_id) DO UPDATE SET
  course_key = EXCLUDED.course_key, phase = EXCLUDED.phase,
  display_order = EXCLUDED.display_order, updated_at = now();

-- 3. EVENT LEDGERS
CREATE TABLE IF NOT EXISTS public.course_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_key text NOT NULL REFERENCES public.course_catalog(course_key) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_key)
);
CREATE INDEX IF NOT EXISTS idx_course_completions_course ON public.course_completions(course_key, completed_at);
CREATE INDEX IF NOT EXISTS idx_course_completions_user ON public.course_completions(user_id);

CREATE TABLE IF NOT EXISTS public.general_application_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  application_id uuid REFERENCES public.general_applications(id) ON DELETE SET NULL,
  UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_general_app_submissions_at ON public.general_application_submissions(submitted_at);

CREATE TABLE IF NOT EXISTS public.badges_awarded (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_code text NOT NULL,
  source text NOT NULL,
  source_id text NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, badge_code, source_id)
);
CREATE INDEX IF NOT EXISTS idx_badges_code_at ON public.badges_awarded(badge_code, awarded_at);
CREATE INDEX IF NOT EXISTS idx_badges_user_code ON public.badges_awarded(user_id, badge_code);

-- 4. PRECOMPUTED READ SURFACE
CREATE TABLE IF NOT EXISTS public.network_stats_snapshots (
  scope text NOT NULL,
  metric_key text NOT NULL,
  value bigint NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, metric_key)
);

CREATE TABLE IF NOT EXISTS public.course_completion_stats (
  course_key text PRIMARY KEY REFERENCES public.course_catalog(course_key) ON DELETE CASCADE,
  total_completions bigint NOT NULL DEFAULT 0,
  past_7d_completions bigint NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.network_stats_overrides (
  metric_key text PRIMARY KEY,
  value bigint NOT NULL,
  reason text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.network_stats_historical (
  metric_key text PRIMARY KEY,
  value bigint NOT NULL,
  source text NOT NULL DEFAULT 'airtable',
  last_synced_at timestamptz,
  synced_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stats_drift_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at timestamptz NOT NULL DEFAULT now(),
  check_name text NOT NULL,
  expected bigint,
  actual bigint,
  details jsonb
);

-- 5. RLS
ALTER TABLE public.course_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.general_application_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges_awarded ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_stats_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_completion_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_stats_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_stats_historical ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stats_drift_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated read course_catalog" ON public.course_catalog FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated read lesson_catalog" ON public.lesson_catalog FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated read network_stats_snapshots" ON public.network_stats_snapshots FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated read course_completion_stats" ON public.course_completion_stats FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated read network_stats_overrides" ON public.network_stats_overrides FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated read network_stats_historical" ON public.network_stats_historical FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users read own course_completions" ON public.course_completions FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users read own badges" ON public.badges_awarded FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users read own app submissions" ON public.general_application_submissions FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins read drift log" ON public.stats_drift_log FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage course_catalog" ON public.course_catalog FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage lesson_catalog" ON public.lesson_catalog FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage overrides" ON public.network_stats_overrides FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage historical" ON public.network_stats_historical FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. HELPERS + TRIGGERS

CREATE OR REPLACE FUNCTION public.fn_emit_badge(
  _user_id uuid, _badge_code text, _source text, _source_id text, _awarded_at timestamptz DEFAULT now()
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_inserted int;
BEGIN
  INSERT INTO public.badges_awarded (user_id, badge_code, source, source_id, awarded_at)
  VALUES (_user_id, _badge_code, _source, _source_id, _awarded_at)
  ON CONFLICT (user_id, badge_code, source_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted > 0;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_emit_badge(uuid,text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_evaluate_course_completion(_user_id uuid, _lesson_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_course_key text; v_required int; v_done int;
  v_completion_id uuid; v_is_test boolean;
BEGIN
  SELECT course_key INTO v_course_key
  FROM public.lesson_catalog
  WHERE lesson_id = _lesson_id AND active AND required
  LIMIT 1;
  IF v_course_key IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO v_required FROM public.lesson_catalog
  WHERE course_key = v_course_key AND active AND required;

  SELECT count(DISTINCT jp.task_id) INTO v_done
  FROM public.journey_progress jp
  JOIN public.lesson_catalog lc ON lc.lesson_id = jp.task_id
  WHERE jp.user_id = _user_id AND jp.completed = true
    AND lc.course_key = v_course_key AND lc.active AND lc.required;

  IF v_done < v_required THEN RETURN; END IF;

  INSERT INTO public.course_completions (user_id, course_key, completed_at)
  VALUES (_user_id, v_course_key, now())
  ON CONFLICT (user_id, course_key) DO NOTHING
  RETURNING id INTO v_completion_id;

  IF v_completion_id IS NULL THEN RETURN; END IF;

  PERFORM public.fn_emit_badge(_user_id, 'course_completed:' || v_course_key,
    'course_completion', v_completion_id::text, now());

  SELECT COALESCE(is_test_account, false) INTO v_is_test
  FROM public.profiles WHERE user_id = _user_id;

  IF NOT COALESCE(v_is_test, false) THEN
    INSERT INTO public.network_stats_snapshots (scope, metric_key, value, computed_at)
    VALUES ('all_time','core_course_completions_total',1,now())
    ON CONFLICT (scope, metric_key) DO UPDATE SET value = network_stats_snapshots.value + 1, computed_at = now();

    INSERT INTO public.network_stats_snapshots (scope, metric_key, value, computed_at)
    VALUES ('all_time','badges_earned_total',1,now())
    ON CONFLICT (scope, metric_key) DO UPDATE SET value = network_stats_snapshots.value + 1, computed_at = now();

    INSERT INTO public.course_completion_stats (course_key, total_completions, past_7d_completions, computed_at)
    VALUES (v_course_key, 1, 1, now())
    ON CONFLICT (course_key) DO UPDATE SET
      total_completions = course_completion_stats.total_completions + 1,
      past_7d_completions = course_completion_stats.past_7d_completions + 1,
      computed_at = now();
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_evaluate_course_completion(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_journey_progress_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.completed = true AND (TG_OP = 'INSERT' OR OLD.completed IS DISTINCT FROM NEW.completed) THEN
    PERFORM public.fn_evaluate_course_completion(NEW.user_id, NEW.task_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS journey_progress_complete_award ON public.journey_progress;
CREATE TRIGGER journey_progress_complete_award
AFTER INSERT OR UPDATE ON public.journey_progress
FOR EACH ROW EXECUTE FUNCTION public.trg_journey_progress_complete();

CREATE OR REPLACE FUNCTION public.trg_general_app_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_sub_id uuid; v_is_test boolean;
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.general_application_submissions (user_id, submitted_at, application_id)
    VALUES (NEW.user_id, COALESCE(NEW.completed_at, now()), NEW.id)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id INTO v_sub_id;
    IF v_sub_id IS NOT NULL THEN
      PERFORM public.fn_emit_badge(NEW.user_id, 'application_submitted',
        'general_application', v_sub_id::text, COALESCE(NEW.completed_at, now()));
      SELECT COALESCE(is_test_account, false) INTO v_is_test FROM public.profiles WHERE user_id = NEW.user_id;
      IF NOT COALESCE(v_is_test, false) THEN
        INSERT INTO public.network_stats_snapshots (scope, metric_key, value, computed_at)
        VALUES ('all_time','general_applications_total',1,now())
        ON CONFLICT (scope, metric_key) DO UPDATE SET value = network_stats_snapshots.value + 1, computed_at = now();
        INSERT INTO public.network_stats_snapshots (scope, metric_key, value, computed_at)
        VALUES ('all_time','badges_earned_total',1,now())
        ON CONFLICT (scope, metric_key) DO UPDATE SET value = network_stats_snapshots.value + 1, computed_at = now();
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS general_app_submitted_award ON public.general_applications;
CREATE TRIGGER general_app_submitted_award
AFTER INSERT OR UPDATE ON public.general_applications
FOR EACH ROW EXECUTE FUNCTION public.trg_general_app_submitted();

-- 7. RECOMPUTE / BACKFILL
CREATE OR REPLACE FUNCTION public.recompute_all_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_total_signups bigint; v_core_total bigint; v_apps_total bigint; v_badges_total bigint;
  v_pw_start date := (current_date - interval '7 days')::date;
  v_pw_end date := current_date;
  v_pw_signups bigint; v_pw_core bigint; v_pw_apps bigint; v_pw_badges bigint;
BEGIN
  IF NOT pg_try_advisory_xact_lock(8675309) THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;

  -- Backfill course_completions
  WITH per_user_course AS (
    SELECT jp.user_id, lc.course_key,
           count(DISTINCT jp.task_id) AS done,
           max(jp.completed_at) AS max_at
    FROM public.journey_progress jp
    JOIN public.lesson_catalog lc ON lc.lesson_id = jp.task_id AND lc.active AND lc.required
    WHERE jp.completed = true
    GROUP BY jp.user_id, lc.course_key
  ),
  course_req AS (
    SELECT course_key, count(*) AS req
    FROM public.lesson_catalog WHERE active AND required GROUP BY course_key
  )
  INSERT INTO public.course_completions (user_id, course_key, completed_at)
  SELECT puc.user_id, puc.course_key, COALESCE(puc.max_at, now())
  FROM per_user_course puc
  JOIN course_req cr ON cr.course_key = puc.course_key
  WHERE puc.done >= cr.req
  ON CONFLICT (user_id, course_key) DO NOTHING;

  -- Backfill app submissions
  INSERT INTO public.general_application_submissions (user_id, submitted_at, application_id)
  SELECT DISTINCT ON (user_id) user_id, COALESCE(completed_at, updated_at), id
  FROM public.general_applications
  WHERE status = 'completed'
  ORDER BY user_id, COALESCE(completed_at, updated_at) ASC
  ON CONFLICT (user_id) DO NOTHING;

  -- Backfill badges from ledgers
  INSERT INTO public.badges_awarded (user_id, badge_code, source, source_id, awarded_at)
  SELECT user_id, 'course_completed:' || course_key, 'course_completion', id::text, completed_at
  FROM public.course_completions
  ON CONFLICT (user_id, badge_code, source_id) DO NOTHING;

  INSERT INTO public.badges_awarded (user_id, badge_code, source, source_id, awarded_at)
  SELECT user_id, 'application_submitted', 'general_application', id::text, submitted_at
  FROM public.general_application_submissions
  ON CONFLICT (user_id, badge_code, source_id) DO NOTHING;

  INSERT INTO public.badges_awarded (user_id, badge_code, source, source_id, awarded_at)
  SELECT p.user_id, 'discord_linked', 'profile', p.user_id::text, COALESCE(p.updated_at, now())
  FROM public.profiles p
  WHERE p.discord_user_id IS NOT NULL AND p.discord_user_id <> ''
  ON CONFLICT (user_id, badge_code, source_id) DO NOTHING;

  -- Aggregates
  SELECT count(*) INTO v_total_signups FROM public.profiles WHERE NOT is_test_account;
  SELECT count(*) INTO v_core_total
    FROM public.course_completions cc
    JOIN public.course_catalog cat ON cat.course_key = cc.course_key
    JOIN public.profiles p ON p.user_id = cc.user_id
    WHERE cat.tier = 'core' AND NOT p.is_test_account;
  SELECT count(*) INTO v_apps_total
    FROM public.general_application_submissions s
    JOIN public.profiles p ON p.user_id = s.user_id WHERE NOT p.is_test_account;
  SELECT count(*) INTO v_badges_total
    FROM public.badges_awarded b
    JOIN public.profiles p ON p.user_id = b.user_id
    WHERE NOT p.is_test_account AND b.badge_code NOT LIKE 'phase_completed:%';

  SELECT count(*) INTO v_pw_signups FROM public.profiles
    WHERE NOT is_test_account AND created_at::date >= v_pw_start AND created_at::date < v_pw_end;
  SELECT count(*) INTO v_pw_core FROM public.course_completions cc
    JOIN public.course_catalog cat ON cat.course_key = cc.course_key
    JOIN public.profiles p ON p.user_id = cc.user_id
    WHERE cat.tier = 'core' AND NOT p.is_test_account
      AND cc.completed_at::date >= v_pw_start AND cc.completed_at::date < v_pw_end;
  SELECT count(*) INTO v_pw_apps FROM public.general_application_submissions s
    JOIN public.profiles p ON p.user_id = s.user_id
    WHERE NOT p.is_test_account
      AND s.submitted_at::date >= v_pw_start AND s.submitted_at::date < v_pw_end;
  SELECT count(*) INTO v_pw_badges FROM public.badges_awarded b
    JOIN public.profiles p ON p.user_id = b.user_id
    WHERE NOT p.is_test_account AND b.badge_code NOT LIKE 'phase_completed:%'
      AND b.awarded_at::date >= v_pw_start AND b.awarded_at::date < v_pw_end;

  INSERT INTO public.network_stats_snapshots(scope, metric_key, value, computed_at) VALUES
    ('all_time','total_signups',v_total_signups,now()),
    ('all_time','core_course_completions_total',v_core_total,now()),
    ('all_time','general_applications_total',v_apps_total,now()),
    ('all_time','badges_earned_total',v_badges_total,now()),
    ('past_7d','total_signups',v_pw_signups,now()),
    ('past_7d','core_course_completions_total',v_pw_core,now()),
    ('past_7d','general_applications_total',v_pw_apps,now()),
    ('past_7d','badges_earned_total',v_pw_badges,now())
  ON CONFLICT (scope, metric_key) DO UPDATE SET value = EXCLUDED.value, computed_at = now();

  INSERT INTO public.course_completion_stats (course_key, total_completions, past_7d_completions, computed_at)
  SELECT cc.course_key, count(*),
         count(*) FILTER (WHERE cc.completed_at::date >= v_pw_start AND cc.completed_at::date < v_pw_end),
         now()
  FROM public.course_completions cc
  JOIN public.profiles p ON p.user_id = cc.user_id
  WHERE NOT p.is_test_account
  GROUP BY cc.course_key
  ON CONFLICT (course_key) DO UPDATE SET
    total_completions = EXCLUDED.total_completions,
    past_7d_completions = EXCLUDED.past_7d_completions,
    computed_at = now();

  INSERT INTO public.course_completion_stats (course_key, total_completions, past_7d_completions, computed_at)
  SELECT cc.course_key, 0, 0, now() FROM public.course_catalog cc
  ON CONFLICT (course_key) DO NOTHING;

  RETURN jsonb_build_object('ok', true,
    'total_signups', v_total_signups,
    'core_course_completions_total', v_core_total,
    'general_applications_total', v_apps_total,
    'badges_earned_total', v_badges_total);
END $$;
REVOKE EXECUTE ON FUNCTION public.recompute_all_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_all_stats() TO service_role;

-- 8. SEED OVERRIDES + HISTORICAL
INSERT INTO public.network_stats_overrides(metric_key, value, reason) VALUES
  ('projects_live', 11, 'Frozen by product owner — manual count'),
  ('projects_previously_completed', 120, 'Frozen by product owner — historical count'),
  ('prev_week_beginner_active', 0, 'Frozen by product owner'),
  ('prev_week_advanced_active', 0, 'Frozen by product owner'),
  ('beginner_courses_active', 0, 'Live = 0; historical Service Leadership lives in historical table'),
  ('advanced_courses_active', 0, 'Live = 0; historical Masterclass delta lives in historical table')
ON CONFLICT (metric_key) DO UPDATE SET value = EXCLUDED.value, reason = EXCLUDED.reason, updated_at = now();

INSERT INTO public.network_stats_historical(metric_key, value, source, last_synced_at)
SELECT 'general_applications_pre_platform', 890, 'airtable', updated_at FROM public.network_stats_baselines LIMIT 1
ON CONFLICT (metric_key) DO UPDATE SET value = EXCLUDED.value, last_synced_at = EXCLUDED.last_synced_at, updated_at = now();
INSERT INTO public.network_stats_historical(metric_key, value, source, last_synced_at)
SELECT 'service_leadership_unique', 1101, 'airtable', updated_at FROM public.network_stats_baselines LIMIT 1
ON CONFLICT (metric_key) DO UPDATE SET value = EXCLUDED.value, last_synced_at = EXCLUDED.last_synced_at, updated_at = now();
INSERT INTO public.network_stats_historical(metric_key, value, source, last_synced_at)
SELECT 'masterclass_total', 1881, 'airtable', updated_at FROM public.network_stats_baselines LIMIT 1
ON CONFLICT (metric_key) DO UPDATE SET value = EXCLUDED.value, last_synced_at = EXCLUDED.last_synced_at, updated_at = now();
INSERT INTO public.network_stats_historical(metric_key, value, source, last_synced_at)
SELECT 'masterclass_minus_servlead', 780, 'airtable', updated_at FROM public.network_stats_baselines LIMIT 1
ON CONFLICT (metric_key) DO UPDATE SET value = EXCLUDED.value, last_synced_at = EXCLUDED.last_synced_at, updated_at = now();

-- 9. INITIAL RECOMPUTE
SELECT public.recompute_all_stats();

-- 10. RPC REWRITES
DROP FUNCTION IF EXISTS public.get_network_stats();
CREATE OR REPLACE FUNCTION public.get_network_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
WITH s AS (SELECT metric_key, value FROM public.network_stats_snapshots WHERE scope = 'all_time'),
pw AS (SELECT metric_key, value FROM public.network_stats_snapshots WHERE scope = 'past_7d'),
o AS (SELECT metric_key, value FROM public.network_stats_overrides),
h AS (SELECT metric_key, value, last_synced_at FROM public.network_stats_historical),
proj AS (
  SELECT
    count(*) FILTER (WHERE LOWER(project_status::text) = 'apply_now') AS open_apps,
    count(*) FILTER (WHERE LOWER(project_status::text) IN ('coming_soon','recruiting','team_onboarding')) AS coming_soon
  FROM public.projects
)
SELECT jsonb_build_object(
  'total_signups',                 COALESCE((SELECT value FROM s WHERE metric_key='total_signups'), 0),
  'core_courses_active',           COALESCE((SELECT value FROM s WHERE metric_key='core_course_completions_total'), 0),
  'beginner_courses_active',       COALESCE((SELECT value FROM o WHERE metric_key='beginner_courses_active'), 0),
  'advanced_courses_active',       COALESCE((SELECT value FROM o WHERE metric_key='advanced_courses_active'), 0),
  'applications_completed',        COALESCE((SELECT value FROM s WHERE metric_key='general_applications_total'), 0),
  'badges_earned',                 COALESCE((SELECT value FROM s WHERE metric_key='badges_earned_total'), 0),
  'prev_week_start',               to_char((current_date - interval '7 days')::date, 'YYYY-MM-DD'),
  'prev_week_end',                 to_char(current_date, 'YYYY-MM-DD'),
  'prev_week_signups',             COALESCE((SELECT value FROM pw WHERE metric_key='total_signups'), 0),
  'prev_week_core_active',         COALESCE((SELECT value FROM pw WHERE metric_key='core_course_completions_total'), 0),
  'prev_week_beginner_active',     COALESCE((SELECT value FROM o WHERE metric_key='prev_week_beginner_active'), 0),
  'prev_week_advanced_active',     COALESCE((SELECT value FROM o WHERE metric_key='prev_week_advanced_active'), 0),
  'prev_week_applications',        COALESCE((SELECT value FROM pw WHERE metric_key='general_applications_total'), 0),
  'prev_week_badges',              COALESCE((SELECT value FROM pw WHERE metric_key='badges_earned_total'), 0),
  'projects_open_applications',    (SELECT open_apps FROM proj),
  'projects_coming_soon',          (SELECT coming_soon FROM proj),
  'projects_live',                 COALESCE((SELECT value FROM o WHERE metric_key='projects_live'), 0),
  'projects_previously_completed', COALESCE((SELECT value FROM o WHERE metric_key='projects_previously_completed'), 0),
  'historical', jsonb_build_object(
    'general_applications_pre_platform', COALESCE((SELECT value FROM h WHERE metric_key='general_applications_pre_platform'), 0),
    'service_leadership_unique',         COALESCE((SELECT value FROM h WHERE metric_key='service_leadership_unique'), 0),
    'masterclass_total',                 COALESCE((SELECT value FROM h WHERE metric_key='masterclass_total'), 0),
    'masterclass_minus_servlead',        COALESCE((SELECT value FROM h WHERE metric_key='masterclass_minus_servlead'), 0),
    'last_synced_at',                    (SELECT max(last_synced_at) FROM h)
  )
);
$$;
GRANT EXECUTE ON FUNCTION public.get_network_stats() TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_course_completion_counts(jsonb);
CREATE OR REPLACE FUNCTION public.get_course_completion_counts(_course_specs jsonb)
RETURNS TABLE(course_key text, completers bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.course_key, COALESCE(stats.total_completions, 0)::bigint AS completers
  FROM jsonb_array_elements(coalesce(_course_specs, '[]'::jsonb)) AS spec
  CROSS JOIN LATERAL (SELECT (spec->>'key')::text AS course_key) s
  LEFT JOIN public.course_completion_stats stats ON stats.course_key = s.course_key;
$$;
GRANT EXECUTE ON FUNCTION public.get_course_completion_counts(jsonb) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_recompute_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN public.recompute_all_stats();
END $$;
GRANT EXECUTE ON FUNCTION public.admin_recompute_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_test_account(_user_id uuid, _is_test boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles SET is_test_account = _is_test, updated_at = now() WHERE user_id = _user_id;
  PERFORM public.recompute_all_stats();
END $$;
GRANT EXECUTE ON FUNCTION public.admin_set_test_account(uuid, boolean) TO authenticated;