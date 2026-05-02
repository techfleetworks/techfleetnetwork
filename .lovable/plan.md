# CSV → Database Migration: Tech Fleet Reference Data

## 1. What we have today

`public/data/` contains 17 CSVs that ship with the app bundle:

| Domain | File | Approx. records |
|---|---|---|
| Skills (data-types index) | `skills-framework.csv` | 16 |
| Skills (full catalog) | `skills.csv` | ~600 |
| Practices | `practices.csv` | ~120 |
| Activities | `activities.csv` | ~700 |
| Duties (Roles) | `duties.csv` | 17 |
| Deliverables | `deliverables.csv` (+ `-2.csv` dup) | ~400 |
| Project Milestones | `milestones.csv` | 48 |
| Workshops | `workshops-detailed.csv` | 67 |
| Agile Methods | `agile-methods.csv` | ~60 |
| Team Functions | `team-functions.csv` | 7 |
| Tools | `tools.csv` | 46 |
| Tech Job Categories | `tech-job-categories.csv` | 18 |
| Job Industries | `job-industries.csv` | ~120 |
| Job Specializations | `job-specializations.csv` | 67 |
| Company Types | `company-types.csv` | 3 |
| Handbooks (detailed) | `handbooks-detailed.csv` | 29 |

### How they're used right now

- **Admin Ingest page** (`/admin/ingest`) reads each CSV, sends it to the `ingest-csv-knowledge` edge function which **flattens each row into a Markdown blob and upserts into `knowledge_base`** (one row per entity, content = giant markdown). This is the only canonical store today.
- **Fleety chatbot** (`techfleet-chat` edge fn) and Discord `/ask` (`discord-interactions`) full-text scan `knowledge_base.content` to answer questions.
- **Class form** uses `src/lib/skills-framework.ts` — a hardcoded TS array we generated from `skills-framework.csv` last turn (Hard + Soft Skills column). Nothing else in the UI uses the CSVs at runtime.
- **Resources page**, **Curriculum**, **Workshops course**, etc. use TS files in `src/data/*` (separate authored content), not these CSVs.

So today the CSVs are: (a) shipped to every visitor in the bundle, (b) ingested into one denormalized text table, (c) hardcoded into one skills picker.

---

## 2. Target database model

Create a `reference` domain with **one normalized table per entity** plus join tables for the cross-references that already exist in the CSVs (skill ↔ activity, milestone ↔ deliverable, etc.). All tables share a common shape:

```text
reference.<entity>
  id            uuid pk
  slug          text unique     -- url-safe identifier from name
  name          text not null
  description   text
  category      text
  data          jsonb           -- everything else, schema-less, indexed via GIN
  search_tsv    tsvector        -- generated; full-text search
  is_active     boolean default true
  source        text default 'csv'
  source_row_id text             -- traceability back to CSV
  created_at / updated_at timestamptz
```

Tables to create:

- `reference_skills` (from `skills.csv`, supersedes `skills-framework.csv`)
- `reference_practices`
- `reference_activities`
- `reference_duties` (the "Roles" ask)
- `reference_deliverables`
- `reference_workshops`
- `reference_agile_methods`
- `reference_project_milestones`
- `reference_team_functions`
- `reference_tools`
- `reference_tech_job_categories`
- `reference_job_industries`
- `reference_job_specializations`
- `reference_company_types`

Join tables (only the relationships actually referenced by features today + the obvious ones for Fleety):
- `reference_skill_activities`, `reference_activity_deliverables`, `reference_milestone_deliverables`, `reference_duty_skills`, `reference_workshop_deliverables`, `reference_function_duties`.

### RLS

- Every table: `ENABLE RLS`, `FORCE ROW LEVEL SECURITY`.
- `SELECT` policy: `to authenticated using (is_active)` — anyone signed in can read. (Anon stays blocked because every consumer page is gated.)
- `INSERT/UPDATE/DELETE` policy: admins only via `has_role(auth.uid(),'admin')`.
- Grants: `REVOKE ALL FROM anon`.

### Indexing & search

- `idx_<entity>_slug` unique btree, `idx_<entity>_name_trgm` (pg_trgm) for typeahead, GIN on `search_tsv` and on `data` jsonb. Materialized `search_tsv` column populated by trigger over `name + description + data`.

### Loader

A new edge function `ingest-reference-csv` (admin-only, JWT + role check, mirrors existing `ingest-csv-knowledge`) parses each CSV, maps the canonical columns (Name, Description, Category, etc.) to the typed columns, dumps the rest into `data` jsonb, populates join tables when a CSV column lists related entities by name. Idempotent upsert on `(slug)`.

A migration seeds the tables by calling the loader for each CSV at run-once via `supabase/seed.sql` invocation pattern; alternatively the existing `/admin/ingest` page gets a second button "Sync to Reference Tables" that calls the new function. Both paths kept so re-syncs are 1-click.

`knowledge_base` is **not** removed — Fleety still uses it for the long-form markdown blobs and scraped web pages. Reference tables become the structured complement.

---

## 3. Where the system will use the database after migration

| Surface | Today | After |
|---|---|---|
| Class form → Skills multi-select | Hardcoded `src/lib/skills-framework.ts` (121 strings) | `useReferenceSkills()` React Query hook → `reference_skills`, cached 24h, prefetched on `/teach/classes/new` route |
| Profile / future skill pickers | n/a (none today) | Same hook reused |
| Project openings & application form (skills, deliverables, milestones tags) | Free text | Switch to typeahead-backed selectors against reference tables |
| Fleety chatbot context retrieval | One scan of `knowledge_base.content` | Hybrid: structured lookup (`reference_*` by tsvector + trigram) for known-entity questions ("what skills are in the Discovery milestone?") + existing markdown fallback. Fewer tokens to LLM, faster answers. |
| Discord `/ask` slash command | Same as Fleety | Same hybrid |
| Universal Search (⌘K) | Profiles, clients, projects | Add Skills, Activities, Workshops, Milestones results |
| Resources Explore (AI recs) | Uses `knowledge_base` | Switches to structured queries for filtering by category/duty |
| Admin Ingest page | Loads CSVs into `knowledge_base` | Adds "Sync Reference Tables" button; can deprecate raw CSVs from `/public/data` once verified |

### React Query plan (client side)

- New service `src/services/reference.service.ts` exposing `listSkills`, `listActivities`, `listMilestones`, `listDuties`, `listWorkshops`, `listDeliverables`, `listAgileMethods`, etc., each `select id, slug, name, category` only — small payloads.
- Hooks in `src/hooks/use-reference.ts` with `staleTime: 24h`, `gcTime: 7d`, key `["reference", entity]`. One-shot prefetch on app boot for the small lists (`duties`, `team_functions`, `milestones`, `tech_job_categories`).
- Strip `src/lib/skills-framework.ts`; class form switches to the new hook.

### Files we'll touch

- `supabase/migrations/<ts>_reference_tables.sql` — schema + RLS + indexes + triggers
- `supabase/functions/ingest-reference-csv/index.ts` — admin-only loader
- `src/services/reference.service.ts` (new)
- `src/hooks/use-reference.ts` (new)
- `src/pages/ClassFormPage.tsx` — swap import
- `src/pages/AdminIngestPage.tsx` — add "Sync Reference Tables" button
- `src/components/UniversalSearch.tsx` — add reference results
- `supabase/functions/techfleet-chat/index.ts` — add structured retrieval path
- `supabase/functions/discord-interactions/index.ts` — same
- Delete `src/lib/skills-framework.ts` (kept as fallback during rollout, removed in cleanup commit)
- BDD scenarios in `bdd_scenarios` covering: admin sync, picker loads from DB, RLS denies anon writes, Fleety uses structured path

---

## 4. Effects of the migration

**Security**
- Strong gain: structured tables get strict RLS (admin write, authenticated read of `is_active`). Today the CSVs are world-readable static assets bundled with the SPA — anyone, including unauthenticated visitors, can `GET /data/skills.csv` and download the entire framework. After migration, raw CSVs can be removed from `/public/data` and access is gated by RLS.
- Admin-only loader uses JWT + role check (same pattern as `ingest-csv-knowledge`).
- Risk: jsonb `data` column could leak sensitive fields if a future CSV adds them — mitigated by an explicit allow-list in the loader.

**UX**
- Skills/activity/milestone pickers become live, searchable typeaheads with descriptions on hover instead of a static dropdown — better recognition over recall (NN/g #6).
- Admins can edit names, descriptions, categories without redeploying — content updates ship instantly.
- One source of truth: every form across the app shows the same skills, so users see consistent terminology.
- Fleety answers become more targeted ("the Discovery milestone has these 7 deliverables…") because it can join structured rows.

**UI**
- Negligible — same `<MultiSelect>` and command-palette components are reused; rendering count stays roughly the same. New "Sync Reference Tables" button on the admin Ingest page is the only net-new control.

**Performance**
- Initial bundle: removes ~14 MB of CSVs from `public/data` once the SPA stops shipping them (today they're not imported into JS, but they are downloaded by Admin Ingest and served to anyone who knows the path). Bundle stays the same; static asset footprint drops dramatically.
- Class form load: no measurable change — DB query is `select id, name from reference_skills order by name` (~600 rows, <30 KB), cached for 24h via React Query and prefetched on route enter.
- Fleety: meaningful gain for entity-style questions — structured lookup hits a 600-row indexed table instead of scanning 6,000+ markdown blobs in `knowledge_base`. Free-form questions still use the existing path. Net: latency down, LLM token cost down.
- Universal Search: adds 1 extra SELECT per query (~5 ms with trigram indexes); cache for 60s.

**Scalability**
- Today the CSV ingest dumps everything into one wide `knowledge_base` table. Search is O(rows × content size). Reference tables put each domain in its own narrow table with proper indexes; query cost is sub-linear and stable as content grows.
- Edits become row-level; no need to re-ingest a 9 MB CSV to fix one skill description. CDN cache invalidation on `/data/*.csv` is no longer needed.
- Future features (per-skill assessments, per-activity walkthroughs, per-milestone progress) can FK to the reference tables instead of fuzzy string matching.
- Database size impact: ~5–8 MB total for all reference tables — trivial relative to current Postgres footprint.

---

## 5. Migration order (single approval, multi-step build)

1. Migration: create all `reference_*` tables, RLS, indexes, triggers.
2. Edge function: `ingest-reference-csv` with parser + entity mappers + join writes.
3. Admin UI: add "Sync Reference Tables" button and per-table status; click runs all 14 datasets.
4. Client: `reference.service.ts` + `use-reference.ts` hooks; switch Class form to DB-backed picker; delete `skills-framework.ts`.
5. Fleety + Discord: add structured retrieval branch; keep markdown fallback.
6. Universal Search: add reference results.
7. BDD scenarios saved to `bdd_scenarios` for each surface (UI + DB + API expectations).
8. Cleanup: remove `/public/data/*.csv` once admin confirms the sync ran cleanly.

Approve and I'll switch to build mode and implement steps 1-7 in one pass; step 8 waits for your go-ahead after you verify the data in the new tables.
