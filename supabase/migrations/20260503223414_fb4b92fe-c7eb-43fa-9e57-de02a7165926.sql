
-- 1. Add is_placeholder generated column to every reference_* content table
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name LIKE 'reference\_%' ESCAPE '\'
      AND column_name='description'
  LOOP
    EXECUTE format($f$
      ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS is_placeholder boolean
        GENERATED ALWAYS AS (
          description IS NULL
          OR btrim(description) = ''
          OR description ILIKE '%%placeholder%%'
        ) STORED;
    $f$, t);
    EXECUTE format($f$
      CREATE INDEX IF NOT EXISTS %I ON public.%I (is_placeholder) WHERE is_placeholder = true;
    $f$, t || '_is_placeholder_idx', t);
  END LOOP;
END$$;

-- 2. Cleanup malformed CSV-parse residue
DELETE FROM public.reference_workshops
WHERE slug IN (
  'roll',
  'problem-statements-generation-workshoproll',
  'work-prioritization-workshoproll',
  'product-release-vision-scope-and-roadmap-workshop-roll'
);
