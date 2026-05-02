
-- ============================================================
-- PHASE 1: Classes & Cohorts — Tables, RLS, Triggers, RPCs
-- ============================================================

-- ---------- 0. Clean up cohort_status enum ----------
-- Remove unused legacy values (open, live, completed). Nothing references them yet.
DO $$
BEGIN
  -- Rename old type, create clean one, swap, drop old.
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cohort_status') THEN
    -- Only do swap if old values are present
    IF EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'public.cohort_status'::regtype
        AND enumlabel IN ('open','live','completed')
    ) THEN
      ALTER TYPE public.cohort_status RENAME TO cohort_status_old;
      CREATE TYPE public.cohort_status AS ENUM ('draft','pending_review','published','archived','cancelled');
      DROP TYPE public.cohort_status_old;
    END IF;
  ELSE
    CREATE TYPE public.cohort_status AS ENUM ('draft','pending_review','published','archived','cancelled');
  END IF;
END$$;

-- Ensure class_status + class_track exist (idempotent safety net)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'class_track') THEN
    CREATE TYPE public.class_track AS ENUM ('basic_training','advanced_training');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'class_status') THEN
    CREATE TYPE public.class_status AS ENUM ('draft','pending_review','published','archived');
  END IF;
END$$;

-- ---------- 1. CLASSES ----------
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track public.class_track NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 160),
  slug TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 20 AND 600),
  description TEXT,
  outcomes TEXT[] NOT NULL DEFAULT '{}',
  skills TEXT[] NOT NULL DEFAULT '{}',
  prerequisites TEXT[] NOT NULL DEFAULT '{}',
  hero_image_url TEXT,
  status public.class_status NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  archive_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_classes_owner ON public.classes(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_classes_status ON public.classes(status);
CREATE INDEX IF NOT EXISTS idx_classes_track_status ON public.classes(track, status) WHERE status = 'published';

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- ---------- 2. COHORTS ----------
CREATE TABLE IF NOT EXISTS public.cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (length(label) BETWEEN 2 AND 80),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  registration_url TEXT NOT NULL,
  meeting_url TEXT,
  status public.cohort_status NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  archive_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cohorts_class ON public.cohorts(class_id);
CREATE INDEX IF NOT EXISTS idx_cohorts_status ON public.cohorts(status);
CREATE INDEX IF NOT EXISTS idx_cohorts_published_start ON public.cohorts(start_date) WHERE status = 'published';

ALTER TABLE public.cohorts ENABLE ROW LEVEL SECURITY;

-- ---------- 3. CLASS FOLLOWERS ----------
CREATE TABLE IF NOT EXISTS public.class_followers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_class_followers_user ON public.class_followers(user_id);
CREATE INDEX IF NOT EXISTS idx_class_followers_class ON public.class_followers(class_id);

ALTER TABLE public.class_followers ENABLE ROW LEVEL SECURITY;

-- ---------- 4. COHORT REGISTRATIONS (click-through log) ----------
CREATE TABLE IF NOT EXISTS public.cohort_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referrer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cohort_reg_cohort ON public.cohort_registrations(cohort_id);
CREATE INDEX IF NOT EXISTS idx_cohort_reg_user ON public.cohort_registrations(user_id);

ALTER TABLE public.cohort_registrations ENABLE ROW LEVEL SECURITY;

-- ---------- 5. CLASS AUDIT ----------
CREATE TABLE IF NOT EXISTS public.class_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('class','cohort')),
  entity_id UUID NOT NULL,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_audit_class ON public.class_audit(class_id);
CREATE INDEX IF NOT EXISTS idx_class_audit_entity ON public.class_audit(entity_type, entity_id);

ALTER TABLE public.class_audit ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- VALIDATION TRIGGERS
-- ============================================================

-- Slug auto-generation + immutability for classes
CREATE OR REPLACE FUNCTION public.classes_set_slug()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base TEXT;
  candidate TEXT;
  n INT := 0;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    base := lower(regexp_replace(NEW.title, '[^a-zA-Z0-9]+', '-', 'g'));
    base := trim(both '-' from base);
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM public.classes WHERE slug = candidate AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)) LOOP
      n := n + 1;
      candidate := base || '-' || n;
    END LOOP;
    NEW.slug := candidate;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_classes_set_slug ON public.classes;
CREATE TRIGGER trg_classes_set_slug
BEFORE INSERT OR UPDATE ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.classes_set_slug();

-- Class status transition validation
CREATE OR REPLACE FUNCTION public.classes_validate_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status <> NEW.status THEN
    IF NOT (
      (OLD.status = 'draft'          AND NEW.status IN ('pending_review','archived'))
      OR (OLD.status = 'pending_review' AND NEW.status IN ('draft','published','archived'))
      OR (OLD.status = 'published'   AND NEW.status IN ('archived'))
      OR (OLD.status = 'archived'    AND NEW.status IN ('draft'))
    ) THEN
      RAISE EXCEPTION 'Invalid class status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_classes_validate_transition ON public.classes;
CREATE TRIGGER trg_classes_validate_transition
BEFORE UPDATE ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.classes_validate_transition();

-- Cohort validation: dates, https registration url, status transitions
CREATE OR REPLACE FUNCTION public.cohorts_validate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'cohort end_date must be on or after start_date';
  END IF;
  IF NEW.registration_url IS NOT NULL AND NEW.registration_url NOT LIKE 'https://%' THEN
    RAISE EXCEPTION 'cohort registration_url must be https';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> NEW.status THEN
    IF NOT (
      (OLD.status = 'draft'          AND NEW.status IN ('pending_review','archived','cancelled'))
      OR (OLD.status = 'pending_review' AND NEW.status IN ('draft','published','archived','cancelled'))
      OR (OLD.status = 'published'   AND NEW.status IN ('archived','cancelled'))
      OR (OLD.status = 'archived'    AND NEW.status IN ('draft'))
      OR (OLD.status = 'cancelled'   AND NEW.status IN ('draft'))
    ) THEN
      RAISE EXCEPTION 'Invalid cohort status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_cohorts_validate ON public.cohorts;
CREATE TRIGGER trg_cohorts_validate
BEFORE INSERT OR UPDATE ON public.cohorts
FOR EACH ROW EXECUTE FUNCTION public.cohorts_validate();

-- Auto-archive trigger when teacher role is revoked
CREATE OR REPLACE FUNCTION public.handle_teacher_role_revocation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_class RECORD;
BEGIN
  IF OLD.role::text = 'teacher' THEN
    FOR v_class IN
      SELECT id, status FROM public.classes WHERE owner_user_id = OLD.user_id AND status <> 'archived'
    LOOP
      UPDATE public.classes
        SET status = 'archived',
            archived_at = now(),
            archive_reason = 'teacher_role_revoked'
        WHERE id = v_class.id;

      INSERT INTO public.class_audit(entity_type, entity_id, class_id, actor_user_id, action, from_status, to_status, reason)
      VALUES ('class', v_class.id, v_class.id, NULL, 'auto_archive', v_class.status::text, 'archived', 'teacher_role_revoked');

      UPDATE public.cohorts
        SET status = 'archived',
            archived_at = now(),
            archive_reason = 'teacher_role_revoked'
        WHERE class_id = v_class.id AND status NOT IN ('archived','cancelled');
    END LOOP;
  END IF;
  RETURN OLD;
END$$;

DROP TRIGGER IF EXISTS trg_teacher_role_revocation ON public.user_roles;
CREATE TRIGGER trg_teacher_role_revocation
AFTER DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.handle_teacher_role_revocation();

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- Classes
DROP POLICY IF EXISTS "Public can view published classes" ON public.classes;
CREATE POLICY "Public can view published classes" ON public.classes
  FOR SELECT USING (status = 'published');

DROP POLICY IF EXISTS "Teachers can view their own classes" ON public.classes;
CREATE POLICY "Teachers can view their own classes" ON public.classes
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all classes" ON public.classes;
CREATE POLICY "Admins can view all classes" ON public.classes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Teachers can create their own classes" ON public.classes;
CREATE POLICY "Teachers can create their own classes" ON public.classes
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'));

DROP POLICY IF EXISTS "Teachers can edit their draft classes" ON public.classes;
CREATE POLICY "Teachers can edit their draft classes" ON public.classes
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() AND status IN ('draft','pending_review'))
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can update any class" ON public.classes;
CREATE POLICY "Admins can update any class" ON public.classes
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete classes" ON public.classes;
CREATE POLICY "Admins can delete classes" ON public.classes
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Cohorts
DROP POLICY IF EXISTS "Public can view published cohorts of published classes" ON public.cohorts;
CREATE POLICY "Public can view published cohorts of published classes" ON public.cohorts
  FOR SELECT USING (
    status = 'published'
    AND EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.status = 'published')
  );

DROP POLICY IF EXISTS "Teachers can view their cohorts" ON public.cohorts;
CREATE POLICY "Teachers can view their cohorts" ON public.cohorts
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins can view all cohorts" ON public.cohorts;
CREATE POLICY "Admins can view all cohorts" ON public.cohorts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Teachers can create cohorts on their classes" ON public.cohorts;
CREATE POLICY "Teachers can create cohorts on their classes" ON public.cohorts
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.owner_user_id = auth.uid())
    AND public.has_role(auth.uid(), 'teacher')
  );

DROP POLICY IF EXISTS "Teachers can edit their draft cohorts" ON public.cohorts;
CREATE POLICY "Teachers can edit their draft cohorts" ON public.cohorts
  FOR UPDATE TO authenticated
  USING (
    status IN ('draft','pending_review')
    AND EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins can update any cohort" ON public.cohorts;
CREATE POLICY "Admins can update any cohort" ON public.cohorts
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete cohorts" ON public.cohorts;
CREATE POLICY "Admins can delete cohorts" ON public.cohorts
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Class followers
DROP POLICY IF EXISTS "Users can view their follows" ON public.class_followers;
CREATE POLICY "Users can view their follows" ON public.class_followers
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can follow classes" ON public.class_followers;
CREATE POLICY "Users can follow classes" ON public.class_followers
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can unfollow classes" ON public.class_followers;
CREATE POLICY "Users can unfollow classes" ON public.class_followers
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Cohort registrations
DROP POLICY IF EXISTS "Users can view their registrations" ON public.cohort_registrations;
CREATE POLICY "Users can view their registrations" ON public.cohort_registrations
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.cohorts co
      JOIN public.classes c ON c.id = co.class_id
      WHERE co.id = cohort_id AND c.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can record their registration click" ON public.cohort_registrations;
CREATE POLICY "Users can record their registration click" ON public.cohort_registrations
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Class audit (read-only via RLS; writes happen in SECURITY DEFINER funcs/triggers)
DROP POLICY IF EXISTS "Admins can view audit" ON public.class_audit;
CREATE POLICY "Admins can view audit" ON public.class_audit
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Teachers can view audit for their classes" ON public.class_audit;
CREATE POLICY "Teachers can view audit for their classes" ON public.class_audit
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.owner_user_id = auth.uid())
  );

-- ============================================================
-- WORKFLOW RPCs (SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_class_for_review(p_class_id UUID, p_cohort_ids UUID[] DEFAULT '{}')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner UUID; v_old TEXT;
BEGIN
  SELECT owner_user_id, status::text INTO v_owner, v_old FROM public.classes WHERE id = p_class_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'class not found'; END IF;
  IF v_owner <> auth.uid() THEN RAISE EXCEPTION 'not class owner'; END IF;

  UPDATE public.classes SET status = 'pending_review', submitted_at = now() WHERE id = p_class_id;
  INSERT INTO public.class_audit(entity_type, entity_id, class_id, actor_user_id, action, from_status, to_status)
  VALUES ('class', p_class_id, p_class_id, auth.uid(), 'submit_for_review', v_old, 'pending_review');

  IF array_length(p_cohort_ids, 1) > 0 THEN
    UPDATE public.cohorts
      SET status = 'pending_review', submitted_at = now()
      WHERE class_id = p_class_id AND id = ANY(p_cohort_ids) AND status = 'draft';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.approve_and_publish_class(p_class_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT status::text INTO v_old FROM public.classes WHERE id = p_class_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'class not found'; END IF;

  UPDATE public.classes SET status = 'published', published_at = now() WHERE id = p_class_id;
  INSERT INTO public.class_audit(entity_type, entity_id, class_id, actor_user_id, action, from_status, to_status)
  VALUES ('class', p_class_id, p_class_id, auth.uid(), 'publish', v_old, 'published');

  UPDATE public.cohorts SET status = 'published', published_at = now()
    WHERE class_id = p_class_id AND status = 'pending_review';
END$$;

CREATE OR REPLACE FUNCTION public.request_class_changes(p_class_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT status::text INTO v_old FROM public.classes WHERE id = p_class_id;
  UPDATE public.classes SET status = 'draft' WHERE id = p_class_id;
  INSERT INTO public.class_audit(entity_type, entity_id, class_id, actor_user_id, action, from_status, to_status, reason)
  VALUES ('class', p_class_id, p_class_id, auth.uid(), 'request_changes', v_old, 'draft', p_reason);
END$$;

CREATE OR REPLACE FUNCTION public.archive_class(p_class_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT status::text INTO v_old FROM public.classes WHERE id = p_class_id;
  UPDATE public.classes SET status = 'archived', archived_at = now(), archive_reason = p_reason WHERE id = p_class_id;
  UPDATE public.cohorts SET status = 'archived', archived_at = now(), archive_reason = p_reason
    WHERE class_id = p_class_id AND status NOT IN ('archived','cancelled');
  INSERT INTO public.class_audit(entity_type, entity_id, class_id, actor_user_id, action, from_status, to_status, reason)
  VALUES ('class', p_class_id, p_class_id, auth.uid(), 'archive', v_old, 'archived', p_reason);
END$$;

CREATE OR REPLACE FUNCTION public.cancel_cohort(p_cohort_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old TEXT; v_class UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT status::text, class_id INTO v_old, v_class FROM public.cohorts WHERE id = p_cohort_id;
  UPDATE public.cohorts SET status = 'cancelled', archive_reason = p_reason WHERE id = p_cohort_id;
  INSERT INTO public.class_audit(entity_type, entity_id, class_id, actor_user_id, action, from_status, to_status, reason)
  VALUES ('cohort', p_cohort_id, v_class, auth.uid(), 'cancel', v_old, 'cancelled', p_reason);
END$$;

CREATE OR REPLACE FUNCTION public.register_for_cohort_click(p_cohort_id UUID, p_referrer TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  INSERT INTO public.cohort_registrations(cohort_id, user_id, referrer)
  VALUES (p_cohort_id, auth.uid(), p_referrer)
  RETURNING id INTO v_id;
  RETURN v_id;
END$$;
