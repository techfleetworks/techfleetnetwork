
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'published' AND enumtypid = 'public.cohort_status'::regtype) THEN
    ALTER TYPE public.cohort_status ADD VALUE 'published';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'archived' AND enumtypid = 'public.cohort_status'::regtype) THEN
    ALTER TYPE public.cohort_status ADD VALUE 'archived';
  END IF;
END$$;
