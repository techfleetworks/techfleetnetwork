-- =====================================================================
-- Framework Ingest Validation Queries
-- =====================================================================
-- Run these read-only queries after each `ingest-reference-csv` run to
-- prove three invariants:
--   1. COLUMN PRESERVATION   – every CSV header lands in the row
--                              (either as a dedicated column or a key
--                              inside `data` JSONB).
--   2. CELL DEDUPLICATION    – no case-insensitive duplicates remain
--                              inside any multi-value cell.
--   3. RENAMES + KB MIGRATION – legacy terminology is fully replaced
--                              and `knowledge_base` URL prefixes were
--                              rewritten to the `framework://` scheme.
--
-- All queries are SELECT-only. Each returns ZERO rows on success;
-- any returned row is a failure that needs investigation.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. COLUMN PRESERVATION
-- ---------------------------------------------------------------------
-- 1a. Every reference_* row must carry a non-empty `data` JSONB blob
--     (the lossless container for all CSV columns beyond name/desc/cat).
-- ---------------------------------------------------------------------
SELECT 'reference_duties'        AS table_name, id, name
FROM public.reference_duties
WHERE data IS NULL OR data = '{}'::jsonb
UNION ALL
SELECT 'reference_skills',                id, name FROM public.reference_skills
  WHERE data IS NULL OR data = '{}'::jsonb
UNION ALL
SELECT 'reference_practices',             id, name FROM public.reference_practices
  WHERE data IS NULL OR data = '{}'::jsonb
UNION ALL
SELECT 'reference_job_functions',         id, name FROM public.reference_job_functions
  WHERE data IS NULL OR data = '{}'::jsonb
UNION ALL
SELECT 'reference_stakeholders',          id, name FROM public.reference_stakeholders
  WHERE data IS NULL OR data = '{}'::jsonb
UNION ALL
SELECT 'reference_company_types',         id, name FROM public.reference_company_types
  WHERE data IS NULL OR data = '{}'::jsonb
UNION ALL
SELECT 'reference_activities',            id, name FROM public.reference_activities
  WHERE data IS NULL OR data = '{}'::jsonb
UNION ALL
SELECT 'reference_deliverables',          id, name FROM public.reference_deliverables
  WHERE data IS NULL OR data = '{}'::jsonb
UNION ALL
SELECT 'reference_milestones',            id, name FROM public.reference_milestones
  WHERE data IS NULL OR data = '{}'::jsonb
UNION ALL
SELECT 'reference_tools',                 id, name FROM public.reference_tools
  WHERE data IS NULL OR data = '{}'::jsonb
UNION ALL
SELECT 'reference_agile_methods',         id, name FROM public.reference_agile_methods
  WHERE data IS NULL OR data = '{}'::jsonb
UNION ALL
SELECT 'reference_job_industries',        id, name FROM public.reference_job_industries
  WHERE data IS NULL OR data = '{}'::jsonb
UNION ALL
SELECT 'reference_job_specializations',   id, name FROM public.reference_job_specializations
  WHERE data IS NULL OR data = '{}'::jsonb
UNION ALL
SELECT 'reference_tech_job_categories',   id, name FROM public.reference_tech_job_categories
  WHERE data IS NULL OR data = '{}'::jsonb;


-- 1b. Compare the EXPECTED column set per source CSV to the keys that
--     actually landed in `data`. Any missing key = data loss.
--     `expected_columns` mirrors the latest CSV headers verbatim.
-- ---------------------------------------------------------------------
WITH expected AS (
  SELECT 'reference_duties'::text          AS table_name,
         ARRAY[
           'Duty','Description','Job Functions','Technical and Interpersonal Skills',
           'Team Practices','Tools','Stakeholders','Deliverables','Activities',
           'Milestones','Company Types','Job Industries','Job Specializations',
           'Tech Job Categories','Agile Methods','Handbooks','Workshops'
         ]::text[] AS cols
  UNION ALL SELECT 'reference_skills',
         ARRAY['Skill','Description','Category','Duties','Job Functions',
               'Tools','Team Practices','Deliverables','Activities']::text[]
  UNION ALL SELECT 'reference_practices',
         ARRAY['Team Practice','Description','Duties','Job Functions',
               'Technical and Interpersonal Skills','Agile Methods']::text[]
  UNION ALL SELECT 'reference_stakeholders',
         ARRAY['Stakeholder','Description','Company Types','Duties',
               'Technical and Interpersonal Skills','Deliverables']::text[]
  UNION ALL SELECT 'reference_company_types',
         ARRAY['Company Type','Description','Stakeholders','Job Industries',
               'Tech Job Categories']::text[]
)
SELECT e.table_name, missing_key
FROM expected e
CROSS JOIN LATERAL (
  SELECT unnest(e.cols) AS missing_key
) k
WHERE NOT EXISTS (
  SELECT 1
  FROM public.reference_duties d
  WHERE e.table_name = 'reference_duties'
    AND d.data ? k.missing_key
)
  AND e.table_name = 'reference_duties'  -- repeat block per table as needed
;


-- 1c. Generic key-coverage check using the public view
--     `v_reference_data_keys` (created by the ingest migration). It
--     unions every reference_* table and returns one row per
--     (table_name, key) actually present in `data`.
-- ---------------------------------------------------------------------
SELECT table_name, count(*) AS distinct_keys
FROM public.v_reference_data_keys
GROUP BY table_name
ORDER BY table_name;


-- ---------------------------------------------------------------------
-- 2. CELL-LEVEL DEDUPLICATION (case-insensitive)
-- ---------------------------------------------------------------------
-- 2a. Any text[] column with case-insensitive duplicates.
-- ---------------------------------------------------------------------
WITH arr_cols AS (
  SELECT table_schema, table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name LIKE 'reference_%'
    AND data_type = 'ARRAY'
)
SELECT format('%I.%I.%I', table_schema, table_name, column_name) AS location,
       'array dup' AS issue
FROM arr_cols c
WHERE EXISTS (
  SELECT 1
  FROM (
    SELECT format(
      'SELECT 1 FROM public.%I t, LATERAL unnest(t.%I) v(val)
         GROUP BY t.id, lower(v.val)
         HAVING count(*) > 1 LIMIT 1',
      c.table_name, c.column_name) AS q
  ) s
  -- NOTE: execute via dynamic SQL in a DO block for full coverage;
  -- the static query below covers the highest-risk array columns.
);

-- Static sweep across known relationship arrays:
SELECT 'reference_duties.related_skills' AS location, id, name
FROM public.reference_duties t
WHERE related_skills IS NOT NULL
  AND (
    SELECT count(*) FROM unnest(t.related_skills) v
  ) <> (
    SELECT count(DISTINCT lower(v)) FROM unnest(t.related_skills) v
  );

-- 2b. JSONB string-array values inside `data` with case-insensitive dups.
-- ---------------------------------------------------------------------
WITH expanded AS (
  SELECT 'reference_duties' AS tbl, id, name, key, value
  FROM public.reference_duties,
       LATERAL jsonb_each(data) e(key, value)
  WHERE jsonb_typeof(value) = 'array'
  UNION ALL
  SELECT 'reference_skills', id, name, key, value
  FROM public.reference_skills, LATERAL jsonb_each(data) e(key, value)
  WHERE jsonb_typeof(value) = 'array'
  UNION ALL
  SELECT 'reference_stakeholders', id, name, key, value
  FROM public.reference_stakeholders, LATERAL jsonb_each(data) e(key, value)
  WHERE jsonb_typeof(value) = 'array'
  UNION ALL
  SELECT 'reference_company_types', id, name, key, value
  FROM public.reference_company_types, LATERAL jsonb_each(data) e(key, value)
  WHERE jsonb_typeof(value) = 'array'
)
SELECT tbl, id, name, key
FROM expanded e
WHERE (
  SELECT count(*) FROM jsonb_array_elements_text(e.value)
) <> (
  SELECT count(DISTINCT lower(x)) FROM jsonb_array_elements_text(e.value) x
);

-- 2c. Multi-value scalar strings (semicolon / pipe / newline separated)
--     should also have no dups after splitDedupe ran.
-- ---------------------------------------------------------------------
WITH scalar_multivals AS (
  SELECT 'reference_duties' AS tbl, id, name, key, value::text AS raw
  FROM public.reference_duties, LATERAL jsonb_each_text(data) e(key, value)
  WHERE value ~ '[;|\n]'
)
SELECT tbl, id, name, key, raw
FROM scalar_multivals s,
LATERAL regexp_split_to_table(s.raw, '\s*[;|\n]\s*') AS part
GROUP BY tbl, id, name, key, raw
HAVING count(*) <> count(DISTINCT lower(part));


-- ---------------------------------------------------------------------
-- 3. RENAMES + KB URL PREFIX MIGRATION
-- ---------------------------------------------------------------------
-- 3a. Legacy terminology must be gone from every text/jsonb surface.
--     Acceptable matches: ZERO rows.
-- ---------------------------------------------------------------------
WITH legacy AS (
  SELECT * FROM (VALUES
    ('Roles',          'Duties'),
    ('Hard Skills',    'Technical and Interpersonal Skills'),
    ('Soft Skills',    'Team Practices'),
    ('Team Functions', 'Job Functions')
  ) AS t(old_term, new_term)
)
SELECT 'knowledge_base' AS surface, kb.id::text AS row_id, l.old_term
FROM public.knowledge_base kb
CROSS JOIN legacy l
WHERE kb.title ILIKE '%' || l.old_term || '%'
   OR kb.content ILIKE '%' || l.old_term || '%'
UNION ALL
SELECT 'reference_duties.data', d.id::text, l.old_term
FROM public.reference_duties d
CROSS JOIN legacy l
WHERE d.data::text ILIKE '%"' || l.old_term || '"%'
UNION ALL
SELECT 'reference_skills.data', d.id::text, l.old_term
FROM public.reference_skills d
CROSS JOIN legacy l
WHERE d.data::text ILIKE '%"' || l.old_term || '"%'
UNION ALL
SELECT 'reference_practices.data', d.id::text, l.old_term
FROM public.reference_practices d
CROSS JOIN legacy l
WHERE d.data::text ILIKE '%"' || l.old_term || '"%'
UNION ALL
SELECT 'reference_stakeholders.data', d.id::text, l.old_term
FROM public.reference_stakeholders d
CROSS JOIN legacy l
WHERE d.data::text ILIKE '%"' || l.old_term || '"%'
UNION ALL
SELECT 'reference_company_types.data', d.id::text, l.old_term
FROM public.reference_company_types d
CROSS JOIN legacy l
WHERE d.data::text ILIKE '%"' || l.old_term || '"%';

-- 3b. KB rows that should be sourced from reference data must use the
--     `framework://` URL scheme (legacy `airtable://` / `csv://` /
--     bare slugs are no longer acceptable).
-- ---------------------------------------------------------------------
SELECT id, title, source_url
FROM public.knowledge_base
WHERE source_type = 'framework'
  AND (source_url IS NULL OR source_url NOT LIKE 'framework://%');

-- 3c. Every reference_* row must have a paired KB row reachable via
--     framework://<table>/<slug>. Missing pairs = sync trigger gap.
-- ---------------------------------------------------------------------
WITH all_refs AS (
  SELECT 'duties'         AS tbl, slug FROM public.reference_duties
  UNION ALL SELECT 'skills',              slug FROM public.reference_skills
  UNION ALL SELECT 'practices',           slug FROM public.reference_practices
  UNION ALL SELECT 'job_functions',       slug FROM public.reference_job_functions
  UNION ALL SELECT 'stakeholders',        slug FROM public.reference_stakeholders
  UNION ALL SELECT 'company_types',       slug FROM public.reference_company_types
  UNION ALL SELECT 'activities',          slug FROM public.reference_activities
  UNION ALL SELECT 'deliverables',        slug FROM public.reference_deliverables
  UNION ALL SELECT 'milestones',          slug FROM public.reference_milestones
  UNION ALL SELECT 'tools',               slug FROM public.reference_tools
  UNION ALL SELECT 'agile_methods',       slug FROM public.reference_agile_methods
  UNION ALL SELECT 'job_industries',      slug FROM public.reference_job_industries
  UNION ALL SELECT 'job_specializations', slug FROM public.reference_job_specializations
  UNION ALL SELECT 'tech_job_categories', slug FROM public.reference_tech_job_categories
)
SELECT r.tbl, r.slug
FROM all_refs r
LEFT JOIN public.knowledge_base kb
  ON kb.source_url = format('framework://%s/%s', r.tbl, r.slug)
WHERE kb.id IS NULL;

-- 3d. Edge resolution health: nothing should remain in staging after a
--     full ingest. Anything here = unresolved name → slug mapping.
-- ---------------------------------------------------------------------
SELECT count(*) AS unresolved_edges FROM public.framework_edge_staging;

-- =====================================================================
-- SUCCESS CRITERIA SUMMARY
--   • Section 1: zero rows from 1a/1b; 1c row counts match CSV headers.
--   • Section 2: zero rows from 2a/2b/2c.
--   • Section 3: zero rows from 3a/3b/3c; 3d returns 0.
-- =====================================================================
