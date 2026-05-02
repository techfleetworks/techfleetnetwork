-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Helper: shared updated_at trigger
CREATE OR REPLACE FUNCTION public.set_reference_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- Helper: build search_tsv from name + description + data
CREATE OR REPLACE FUNCTION public.set_reference_search_tsv()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.category, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.data::text, '')), 'D');
  RETURN NEW;
END $$;

-- Generic table creator via DO block
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'reference_skills',
    'reference_practices',
    'reference_activities',
    'reference_duties',
    'reference_deliverables',
    'reference_workshops',
    'reference_agile_methods',
    'reference_project_milestones',
    'reference_team_functions',
    'reference_tools',
    'reference_tech_job_categories',
    'reference_job_industries',
    'reference_job_specializations',
    'reference_company_types'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS public.%I (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug text NOT NULL UNIQUE,
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        category text NOT NULL DEFAULT '',
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        search_tsv tsvector,
        is_active boolean NOT NULL DEFAULT true,
        source text NOT NULL DEFAULT 'csv',
        source_row_id text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;
      REVOKE ALL ON public.%I FROM anon;
    $f$, t, t, t, t);

    -- Indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I USING gin (search_tsv);', t || '_search_idx', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I USING gin (name gin_trgm_ops);', t || '_name_trgm_idx', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I USING gin (data jsonb_path_ops);', t || '_data_idx', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (category) WHERE is_active;', t || '_category_idx', t);

    -- Triggers
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_reference_updated_at();', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_search ON public.%I;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_search BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_reference_search_tsv();', t, t);

    -- RLS policies
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can read active %I" ON public.%I;', t, t);
    EXECUTE format($p$
      CREATE POLICY "Authenticated users can read active %I"
      ON public.%I FOR SELECT TO authenticated
      USING (is_active = true);
    $p$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS "Admins can manage %I" ON public.%I;', t, t);
    EXECUTE format($p$
      CREATE POLICY "Admins can manage %I"
      ON public.%I FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
    $p$, t, t);
  END LOOP;
END $$;