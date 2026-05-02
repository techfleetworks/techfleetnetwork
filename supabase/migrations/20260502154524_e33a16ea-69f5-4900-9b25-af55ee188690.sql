DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
      AND enumlabel = 'teacher'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'teacher';
  END IF;
END$$;