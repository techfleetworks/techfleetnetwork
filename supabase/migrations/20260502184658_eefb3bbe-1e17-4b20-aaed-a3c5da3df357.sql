-- Skills & Practices Framework: 5 new reference tables + reference_relationships table.

-- 1) Five new reference_* tables, mirroring the shape of the existing 14.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'reference_projects',
    'reference_stakeholders',
    'reference_job_titles',
    'reference_resources',
    'reference_roles'
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
        source text NOT NULL DEFAULT 'framework',
        source_row_id text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;
      REVOKE ALL ON public.%I FROM anon;
    $f$, t, t, t, t);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I USING gin (search_tsv);', t || '_search_idx', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I USING gin (name gin_trgm_ops);', t || '_name_trgm_idx', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I USING gin (data jsonb_path_ops);', t || '_data_idx', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (category) WHERE is_active;', t || '_category_idx', t);

    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_reference_updated_at();', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_search ON public.%I;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_search BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_reference_search_tsv();', t, t);

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

-- 2) reference_relationships: directed pairs across the 13 framework entities.
CREATE TABLE IF NOT EXISTS public.reference_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity text NOT NULL,
  to_entity text NOT NULL,
  description text NOT NULL,
  inverse_description text,
  all_descriptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'framework_pdf',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reference_relationships_unique_pair UNIQUE (from_entity, to_entity),
  CONSTRAINT reference_relationships_no_self CHECK (from_entity <> to_entity),
  CONSTRAINT reference_relationships_entity_keys CHECK (
    from_entity ~ '^[a-z_]+$' AND to_entity ~ '^[a-z_]+$'
  )
);

ALTER TABLE public.reference_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reference_relationships FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.reference_relationships FROM anon;

CREATE INDEX IF NOT EXISTS reference_relationships_from_idx
  ON public.reference_relationships (from_entity) WHERE is_active;
CREATE INDEX IF NOT EXISTS reference_relationships_to_idx
  ON public.reference_relationships (to_entity) WHERE is_active;

DROP TRIGGER IF EXISTS trg_reference_relationships_updated_at ON public.reference_relationships;
CREATE TRIGGER trg_reference_relationships_updated_at
  BEFORE UPDATE ON public.reference_relationships
  FOR EACH ROW EXECUTE FUNCTION public.set_reference_updated_at();

DROP POLICY IF EXISTS "Authenticated users can read active relationships" ON public.reference_relationships;
CREATE POLICY "Authenticated users can read active relationships"
  ON public.reference_relationships FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage relationships" ON public.reference_relationships;
CREATE POLICY "Admins can manage relationships"
  ON public.reference_relationships FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));