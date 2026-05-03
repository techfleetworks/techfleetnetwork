# Tech Fleet Framework — Final Consolidated Plan (Backend Only, No UI)

A single migration + ingest pass that delivers: a fully-populated Tech Fleet framework knowledge graph, complete terminology rename, lossless CSV ingestion, cell-level deduplication, and Fleety wiring. **Zero UI work, zero user-facing changes, no admin screens.**

---

## 1. Goals & non-goals

**Goals**
- Every column from every CSV you've shared lands in the database — no silent drops, no truncation without a marker.
- All multi-value cells are deduplicated (case-insensitive) before storage.
- All four terminology renames applied everywhere: tables, jsonb keys, KB content, edge function code, BDD scenarios, memory.
- A polymorphic graph of all framework entities + relationships, queryable in <1s by Fleety.
- Read-heavy: p99 in-DB read < 50ms via materialized view; total Fleety round-trip < 1s.

**Non-goals (explicit)**
- No new UI, pages, routes, components, modals, or admin screens.
- No edits to scraped Tech Fleet guide titles (`guide.techfleet.org`).
- No changes to authentication, RLS posture, or session behavior.

---

## 2. Terminology rename (applied everywhere)

| Old | New |
|---|---|
| Roles | Duties |
| Hard Skills | Technical and Interpersonal Skills |
| Soft Skills | Team Practices |
| Team Functions | Job Functions |

Applied in: table names, jsonb keys, jsonb string values, KB titles+content+urls under `framework://`, framework-graph enum values, edge function dataset map, `reference.service.ts` TypeScript union, BDD scenarios, memory entries.

Public guide pages scraped from `guide.techfleet.org` keep their original titles (so we don't mis-cite the source); Fleety's system prompt receives an alias map so it bridges old↔new terms in answers.

---

## 3. Source CSVs (every one ingested, every column kept)

Files in `public/data/` after this pass:

| CSV | Target table | Notes |
|---|---|---|
| `activities.csv` | `reference_activities` | already loaded; re-synced with dedup |
| `agile-methods.csv` | `reference_agile_methods` | re-sync |
| `company-types.csv` | `reference_company_types` | **fresh load** from new upload |
| `deliverables.csv` + `deliverables-2.csv` | `reference_deliverables` | merged, slug-deduped |
| `duties.csv` | `reference_duties` | re-sync; old `reference_roles` dropped |
| `handbooks-detailed.csv` | `knowledge_base` (existing path) | re-sync |
| `job-industries.csv` | `reference_job_industries` | re-sync |
| `job-specializations.csv` | `reference_job_specializations` | re-sync |
| `milestones.csv` | `reference_project_milestones` | re-sync |
| `practices.csv` | `reference_practices` | re-sync |
| `skills.csv` + `skills-framework.csv` | `reference_skills` | merged |
| `stakeholders.csv` | `reference_stakeholders` | **fresh load** from new upload |
| `team-functions.csv` | `reference_job_functions` | re-sync into renamed table |
| `tech-job-categories.csv` | `reference_tech_job_categories` | re-sync |
| `tools.csv` | `reference_tools` | re-sync |
| `workshops-detailed.csv` | `reference_workshops` | re-sync |

Job Titles and Resources reference tables exist but lack source CSVs — edges referencing those entities will land in `framework_edge_staging` until you supply CSVs (no data lost, just deferred).

---

## 4. Fixes to lossy ingest behavior

Three current silent-drop behaviors in `supabase/functions/ingest-reference-csv/index.ts` are removed:

1. ~~`if (key.endsWith(" copy")) continue;`~~ — Airtable-style duplicate columns now kept under their literal header.
2. ~~`if (val.includes("airtableusercontent.com")) continue;`~~ — attachment URLs preserved verbatim.
3. ~~`val.length > 8000` silent slice~~ — per-cell cap raised to 64 KB; if exceeded, value gets explicit `…[truncated <N> chars]` suffix so the loss is visible, never silent.

Long disambiguating headers (e.g. `Required Hard Skills (from Required Tasks) (from Common Deliverables for This Environment) (from Relevant Company Types)`) are kept verbatim as the jsonb key to preserve provenance, and a short alias key is added at the same row for queryability.

---

## 5. Cell-level deduplication

Add `splitDedupe(value)` helper applied to every multi-value column before upsert:
- Comma-split (quote-aware).
- Trim, collapse internal whitespace.
- Case-insensitive uniqueness via `Map<lowercase, originalCasing>`; first occurrence wins.
- Empty entries dropped.
- Sort alphabetically for deterministic diffs.
- Re-joined with `, ` for text cells; stored as JSON arrays inside `data` jsonb where the column is multi-value.

Applied at: ingest function (going forward), one-time backfill over existing `reference_*` rows (idempotent), and inside `tg_sync_reference_to_kb` when rendering neighbor lists into the framework KB body.

`framework_edges` enforces edge-level uniqueness via `UNIQUE (src_type, src_id, rel_type, dst_type, dst_id)` with `ON CONFLICT DO NOTHING`.

---

## 6. Schema changes (single transactional migration)

```sql
-- Renames
ALTER TABLE reference_team_functions RENAME TO reference_job_functions;
ALTER INDEX/TRIGGER ... RENAME ... ;        -- all 6 indexes + 2 triggers
DELETE FROM reference_roles;                -- merge stray row into reference_duties first
DROP TABLE reference_roles;
DROP VIEW framework_entity_v CASCADE;
CREATE VIEW framework_entity_v AS ...       -- rebuilt with duties + job_functions

-- Framework graph
CREATE TYPE framework_entity_type AS ENUM (
  'deliverable','milestone','specialization','tool','activity',
  'skill','agile_method','company_type','duty','job_title',
  'job_function','stakeholder','resource','handbook','practice','workshop'
);
CREATE TYPE framework_rel_type AS ENUM (
  'produces','requires','uses_tool','performed_by','teaches_skill',
  'part_of','applies_method','targets_company_type','references',
  'precedes','related_to','engages_stakeholder','owned_by',
  'uses_practice','collaborates_on','excludes'
);

CREATE TABLE framework_edges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  src_type      framework_entity_type NOT NULL,
  src_id        uuid NOT NULL,
  rel_type      framework_rel_type NOT NULL,
  dst_type      framework_entity_type NOT NULL,
  dst_id        uuid NOT NULL,
  weight        smallint NOT NULL DEFAULT 1,
  source        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (src_type, src_id, rel_type, dst_type, dst_id)
);
CREATE INDEX ON framework_edges (src_type, src_id, rel_type);
CREATE INDEX ON framework_edges (dst_type, dst_id, rel_type);

CREATE TABLE framework_edge_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  src_type framework_entity_type, src_name text,
  rel_type framework_rel_type,
  dst_type framework_entity_type, dst_name text,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE MATERIALIZED VIEW framework_node_neighbors_mv AS ...
CREATE UNIQUE INDEX ON framework_node_neighbors_mv (node_type, node_id);

-- Inverse-edge trigger (auto bidirectional)
-- Debounced REFRESH MATERIALIZED VIEW CONCURRENTLY trigger
```

RLS: `framework_edges` SELECT to `authenticated`; INSERT/UPDATE/DELETE locked to `service_role` only. Staging table: `service_role` + admin only.

---

## 7. RPCs (all SECURITY DEFINER, STABLE, pinned `search_path = public`)

- `get_node_neighbors(p_type, p_id) → jsonb` — `{outgoing, incoming}` grouped by `rel_type`.
- `get_milestone_blueprint(p_milestone_id) → jsonb` — milestone + deliverables + activities + skills + tools + duties + job_functions.
- `get_deliverable_context(p_deliverable_id) → jsonb` — deliverable + producing duties + required skills + tools + parent milestones + stakeholders.
- `get_company_type_context(p_company_type_id) → jsonb` — required vs excluded deliverables + activities + skills + duties + practices + stakeholders.
- `get_stakeholder_context(p_stakeholder_id) → jsonb` — relevant company types + deliverables + activities + duties.
- `search_framework(p_query text, p_limit int) → setof (type, id, slug, name, snippet)` — trigram search across all reference tables.

---

## 8. Edge backfill scope

| Source | Edges produced |
|---|---|
| Deliverables → Milestones, Tools, Specializations, Activities, Skills, Duties | ~6,500 |
| Milestones → Skills, Activities, Deliverables, Duties | ~1,800 |
| Specializations → Activities, Tools, Skills, Duties | ~3,200 |
| Tools → Specializations, Company Types, Duties | ~1,400 |
| Agile Methods → Activities, Duties, Practices | ~900 |
| Stakeholders → Company Types, Skills, Practices, Deliverables, Activities, Duties | ~250 |
| Company Types → Deliverables (req + excl), Activities, Skills, Duties, Practices, Stakeholders | ~600 |
| Handbooks → Audiences, Categories | ~600 |
| **Total** | **~15,250 unique edges** |

Unresolved name lookups → `framework_edge_staging` with both names preserved, never silently dropped.

---

## 9. KB enrichment for Fleety

`tg_sync_reference_to_kb` extended so each `framework://<type>/<slug>` row's `content` field includes its **deduplicated neighbors as readable Markdown** pulled from the materialized view. Example body for a deliverable:

```
# Persona Document
Type: deliverable
Produced during milestones: Discovery, Define
Activities: Affinity Mapping, User Interviews
Skills: Empathy mapping, Research synthesis
Tools: Dovetail, Figma, Miro
Duties: Product Designer, UX Researcher
Job Functions: Research, User Experience
```

Single retrieval gives Fleety the full local subgraph — no extra round-trips.

---

## 10. Fleety chat wiring

In `techfleet-chat` edge function, before the LLM call:
1. Run `search_framework(userQuery, 8)`.
2. For top hits, call `get_node_neighbors` and append the JSON to the system context.
3. Inject the alias map (`Soft Skills → Team Practices`, `Hard Skills → Technical and Interpersonal Skills`, `Roles → Duties`, `Team Functions → Job Functions`) so old-term questions still resolve.
4. Existing KB retrieval stays.

---

## 11. BDD scenarios (all inserted into `bdd_scenarios`, tri-layer asserts)

- `RENAME-001` `reference_team_functions` no longer exists; `reference_job_functions` does. **[DB]** rename reflected. **[Code]** `listReference("job_functions")` returns rows; `"team_functions"` is a TS error.
- `RENAME-002` JSONB key rewrite is idempotent. **[DB]** zero remaining `Hard Skill`/`Soft Skill`/`Team Functions`/`Roles` keys. **[Code]** re-running migration → zero diff.
- `RENAME-003` Framework KB urls migrated. **[DB]** zero rows match `framework://team_functions/%` or `framework://roles/%`; counts preserved under new prefixes.
- `INGEST-LOSSLESS-001` "copy"-suffixed columns and Airtable URL cells are now retained. **[DB]** sample row has the copy column key + the Airtable URL. **[Code]** ingest log notes `kept_attachments=N`.
- `INGEST-LOSSLESS-002` Cells over 64 KB are truncated with explicit marker. **[DB]** value ends with `…[truncated N chars]`. **[Code]** counter incremented.
- `DEDUP-001` Multi-value cells contain no case-insensitive duplicates after ingest. **[DB]** `cardinality(array) = cardinality(distinct lower(unnest(array)))` for every reference row.
- `DEDUP-002` Re-running ingest yields zero diff. **[DB]** row hashes unchanged. **[Code]** ingest returns `inserted=0, updated=0`.
- `STAKEHOLDERS-INGEST-001` 5 stakeholder rows upserted with all relationship columns parsed into edges.
- `COMPANY-TYPES-INGEST-001` 4 company-type rows upserted; required vs excluded deliverables emit distinct edge rel_types.
- `FRAMEWORK-GRAPH-001` Edge upsert idempotent. **[DB]** unique constraint holds. **[Code]** second sync returns `inserted=0`.
- `FRAMEWORK-GRAPH-002` Inverse edge auto-created by trigger. **[DB]** both directions present.
- `FRAMEWORK-GRAPH-003` Unresolved CSV name lands in staging. **[DB]** row exists with `src_name`/`dst_name`. **[Code]** ingest log warns.
- `FRAMEWORK-KB-001` KB row for a deliverable contains its milestones/tools/skills/duties/job_functions, all deduplicated. **[DB]** content matches MV; no repeats.
- `FLEETY-RENAME-001` Asking Fleety "what are the soft skills?" returns content under "Team Practices" with an alias note. **[Code]** LLM context includes alias map.
- `FLEETY-STAKEHOLDER-001` Asking "who do I work with as a UX Researcher in an Agency?" returns stakeholders linked to both that duty and that company type. **[Code]** `get_node_neighbors` payload appears in LLM context.
- `FLEETY-PERF-001` p95 framework retrieval < 200ms. **[DB]** `EXPLAIN` shows MV index hit. **[Code]** instrumentation logs duration.

---

## 12. Security & performance

- Single transactional migration; rebuilt view keeps reads working during the swap.
- Hot reads via materialized view → p99 < 50ms in-DB; Fleety total round-trip < 1s.
- RLS: read-only to `authenticated`, writes locked to `service_role`. RPCs `SECURITY DEFINER` with pinned `search_path`.
- Ingest function continues to require admin JWT (existing auth gate, unchanged).
- No PII in edges or framework KB rows.
- Memory updated: `Reference Data Tables` and `Framework KB Sync` entries reflect the renamed terms and new graph layer.

---

## 13. Deliverables in this single PR

1. SQL migration: renames + jsonb sweep + cell dedup backfill + KB url rewrite + framework graph schema (table, staging, MV, triggers, RPCs).
2. `supabase/functions/ingest-reference-csv/index.ts`: dataset map updates, `splitDedupe`, removal of three lossy-drop behaviors, attachment URL preservation, 64 KB cap with visible truncation marker, edge emission into `framework_edges`/`framework_edge_staging`.
3. `supabase/functions/techfleet-chat/index.ts`: `search_framework` + `get_node_neighbors` injection, alias map.
4. `src/services/reference.service.ts`: type union rename (`team_functions` → `job_functions`, drop `roles`).
5. CSV file replacements in `public/data/` for the latest uploads.
6. BDD scenarios inserted; existing scenarios with old terms rewritten.
7. Memory updates.

Approve and I'll ship the entire pass in one go.
