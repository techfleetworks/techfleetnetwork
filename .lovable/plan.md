## Plan: ingest your 8 CSVs and close every gap

You uploaded the source-of-truth CSVs for: Activities (1,602 rows), Deliverables (1,005), Skills (1,431), Practices (265), Agile Methods (185), Job Specializations (110), Job Functions (21), Duties (19), and Milestones (39).

Each CSV's description column is named differently (`Deliverable Description`, `Specialization Description`, `Skill Description`, `Practice Description`, `Basic Definition of the Method`, `Description`, `Commitment Description`, `Milestone Description`). The hardened ingester now recognizes all of those, so the import will populate `description` correctly this time.

### Steps I will run

1. **Stage** — `code--copy` each `user-uploads://…csv` to `/tmp/` so scripts can read them.

2. **Parse + upsert** — Run a Python ingestion script that mirrors the production `ingest-reference-csv` edge function logic for each dataset:
   - Detect the name column (column 0) and the description column (any header containing description/definition/summary/about/overview).
   - Slugify, dedupe, cap cells, copy other columns into JSONB `data`.
   - Apply changes via `supabase--insert` UPSERTs (chunks of 50) on the matching `reference_*` table — sets `description_source='csv'` for every row that has real CSV text.
   - Preserve any existing `description_source='admin'` rows untouched.

3. **Verify** — Query each table for `description IS NULL OR length<20` and report the per-table residual gap count.

4. **AI fill the residuals** — For any rows still empty (genuinely missing in the CSV, e.g. the `All Product Milestones` / `Nothing` placeholder rows or short-name skills), run the same Lovable AI batch script in 10-row groups, write back via `supabase--insert` with `description_source='ai_generated'`.

5. **Trigger framework graph + Fleety re-embed** — Call `fw_emit_edges_for_entity`, `fw_replay_staging`, `fw_refresh_neighbors_mv`, `fw_refresh_search_mv`, `fw_sync_relationships_to_kb`, then invoke `fleety-embed` for changed slugs so Fleety answers refresh.

6. **Report** — Final per-table summary: rows imported, descriptions from CSV, descriptions from AI, kept admin edits.

### Dataset → table map

| CSV | Reference table | Description column |
|---|---|---|
| Activities | `reference_activities` | Activity Description |
| Deliverables | `reference_deliverables` | Deliverable Description |
| Skills | `reference_skills` | Skill Description |
| Practices | `reference_practices` | Practice Description |
| Agile Methods | `reference_agile_methods` | Basic Definition of the Method |
| Job Specializations | `reference_job_specializations` | Specialization Description |
| Job Functions | `reference_job_functions` | Description |
| Duties | `reference_duties` | Commitment Description |
| Milestones | `reference_project_milestones` | Milestone Description |

### Heads-up

- The Skills CSV has an empty header row (line 2) — my parser will skip empty-name rows so it cannot reintroduce the previously deleted "Activity / Tool / Deliverable" leak rows.
- The Milestones CSV has `Nothing` and `All Product Milestones` rows with no description — those will end up in the AI fill bucket unless you want them excluded; tell me if you want them deleted instead.
- Activities and Deliverables are large; ingest will take a few minutes but completes in a single run.
- No schema changes needed — all groundwork (`description_source`, header detection, merge precedence) shipped in the previous turn.

Approve and I'll run it end to end.