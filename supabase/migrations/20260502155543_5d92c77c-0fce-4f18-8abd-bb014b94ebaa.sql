
-- Add 'teacher' to app_role enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'teacher'
      AND enumtypid = 'public.app_role'::regtype
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'teacher';
  END IF;
END$$;

-- New enums
DO $$ BEGIN
  CREATE TYPE public.class_track AS ENUM ('basic_training', 'advanced_training');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.class_status AS ENUM ('draft', 'pending_review', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cohort_status AS ENUM ('draft', 'pending_review', 'published', 'archived', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
