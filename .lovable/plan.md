## Problem

A recent ingest added 13 workshops + 1 stakeholder with placeholder descriptions (e.g. "Placeholder.", "...placeholder description; to be filled in by content team"). If the content team writes real copy directly in the DB, the **next CSV re-import will silently overwrite those edits** with the placeholders again, because the ingest does an unconditional upsert on `slug`.

Also surfaced during inspection: 4 malformed rows from a bad CSV parse (slugs `roll`, `problem-statements-generation-workshoproll`, `work-prioritization-workshoproll`, `product-release-vision-scope-and-roadmap-workshop-roll`) — these need cleanup too.

## Goals

1. Make placeholder content **safe to replace** — once real copy lands, no future ingest can clobber it.
2. Give the content team a **single visible "Content Gaps" list** so they know exactly what to write.
3. Clean up the 4 malformed CSV rows.
4. Keep Fleety's `framework://` knowledge_base in sync so improved descriptions immediately power chatbot answers.

## Plan

### 1. Add `is_placeholder` flag to all `reference_*` content tables
Migration adds a generated column on `reference_workshops`, `reference_stakeholders` (and any sibling table that takes free-text descriptions):
```
is_placeholder bool GENERATED ALWAYS AS (
  description IS NULL
  OR btrim(description) = ''
  OR description ILIKE '%placeholder%'
) STORED
```
Plus a partial index for fast lookup.

### 2. Make ingest **placeholder-aware** (the real fix)
Update `/admin/ingest` upsert logic so that when a CSV row's incoming description is a placeholder AND the existing DB row's description is real (not placeholder), we **keep the DB value** for `description` (and any other long-form fields). Other columns still upsert normally. This is one `CASE WHEN` per protected column in the upsert SQL — cheap and bulletproof. Log a `kept_existing_description` count in the ingest summary so admins see it worked.

### 3. "Content Gaps" admin panel
New tab inside the existing **System Health → Content** area (no new route; matches the Fleety Coach pattern). Shows:
- Card-view list (per project view-preferences rule) of every `reference_*` row where `is_placeholder = true`
- Columns: Type · Name · Slug · Last updated · "Edit" button
- Filter chips: Workshops, Stakeholders, All
- Inline edit drawer with a textarea + Save (writes description, recomputes `is_placeholder`, triggers framework KB resync for that slug only)
- Empty state: "All content has real descriptions. 🎯"

### 4. Clean up malformed rows
One-shot migration deletes the 4 garbage slugs (`roll`, `*-workshoproll` variants). Confirms via `source_row_id IS NULL OR name !~ '[A-Za-z]'` before delete to avoid nuking anything real.

### 5. Framework KB resync hook
After any description edit on a `reference_*` row, re-embed the matching `framework://<slug>` row in `knowledge_base` so Fleety picks up the new copy on the next turn (reuses existing `fleety-embed` function, single-row mode).

### 6. BDD scenarios (mandatory per project rules)
Add Gherkin to `bdd_scenarios` covering:
- Ingest preserves real description when CSV row is placeholder ([UI] gap count drops, [DB] description unchanged, [Code] ingest summary reports `kept_existing_description >= 1`)
- Editing a placeholder removes it from the gaps list and re-embeds the framework KB row
- Malformed-row cleanup migration leaves all valid rows intact

## What stays out of scope

- No email blast to the content team (you can hand them the gaps URL).
- No bulk-edit UI; one-at-a-time editing is enough for ~14 rows.
- No CSV write-back; content team edits in the app, CSV becomes the seed-only source.

## Files / surfaces touched

- New migration: add `is_placeholder` generated column + partial index + cleanup of 4 malformed slugs
- `supabase/functions/admin-ingest-*/index.ts` — placeholder-aware upsert
- `supabase/functions/fleety-embed/index.ts` — accept single-slug mode (already supports batch)
- `src/pages/admin/SystemHealth.tsx` (or its Content tab) — new "Content Gaps" panel
- `bdd_scenarios` table — 3 new scenarios

## After approval

I'll implement in this order: migration → ingest guard → cleanup → admin UI → KB resync hook → BDD scenarios → verify with a dry-run re-ingest against the current CSV.
