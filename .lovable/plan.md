# Populate Skills & Practices Framework data

## Current state

The UI in `src/components/resources/SkillsPracticesTab.tsx` is already correctly wired — it calls `listReference(entity)` against the `reference_*` tables for every framework category. Nothing in the UI needs to change.

What is missing: 10 of the 19 `reference_*` tables are still empty after the terminology-rename migration, so most Browse categories show "No items to display yet."

| Has data | Empty (needs ingest) |
|---|---|
| activities (101), duties (19), practices (7), skills (115), job_titles (1), projects (1), resources (1), stakeholders (1), relationships (136) | company_types, deliverables, project_milestones, tools, agile_methods, job_industries, job_specializations, job_functions, tech_job_categories, workshops |

## Plan

### 1. Run the reference ingest for every CSV
Invoke the existing `ingest-reference-csv` edge function once per CSV in `public/data/`, server-side from the build sandbox using the service-role key. This is the same code path the `/admin/ingest` "Sync All Reference Tables" button uses, just driven from a script so we don't need a human to click it. Each call is idempotent (upsert on slug).

CSVs to process (17 total): activities, agile-methods, company-types, deliverables, deliverables-2, duties, handbooks-detailed, job-industries, job-specializations, milestones, practices, skills, skills-framework, stakeholders, team-functions, tech-job-categories, tools, workshops-detailed.

For each CSV the script will:
- Read the file from `public/data/`
- POST to the edge function with `{ csv_text, dataset_name }`
- Log `{ table, upserted, edges_emitted, staging_rows }`

### 2. Refresh the materialized view and verify counts
After all ingests finish:
- `REFRESH MATERIALIZED VIEW CONCURRENTLY framework_node_neighbors_mv;` (the trigger debounces this anyway, but force one final refresh).
- Run `supabase/validation/framework_validation.sql` and confirm row counts > 0 for every reference table that has a CSV, `framework_edges` is non-zero, and `framework_edge_staging` only contains expected unresolved names (job titles / resources, which lack source CSVs).

### 3. Spot-check the Framework UI in the preview
Navigate to `/resources` → Skills & Practices Framework → Browse, and verify each of the 13 entity tabs renders cards with the new counts (Deliverables, Tools, Milestones, Company Types, Job Functions, Specializations, Agile Methods, Workshops should all populate).

### 4. Add one BDD scenario
Insert `RESOURCES-FRAMEWORK-UI-001` in `bdd_scenarios` covering: Given an admin has run the reference ingest, When a member opens Resources → Skills & Practices Framework → Browse → any entity, Then [UI] cards render with counts > 0, [DB] `reference_<entity>` returns rows, [Code] `listReference` resolves with non-empty array.

## Out of scope
- No UI redesign — the tab and EntityList component already match the visual identity (cards, search, badges, scroll area).
- No schema changes — the migration from the previous build is sufficient.
- No new admin screen — `/admin/ingest` remains the human-facing trigger.

## Risks
- Ingest is rate-limited per edge function call; the script will run sequentially with a short delay between CSVs.
- If a CSV format has drifted, the function logs the row to `framework_edge_staging` rather than failing — those will surface in the validation step.

Approve and I'll run the ingest, refresh the MV, validate, and confirm the Browse view is populated.
