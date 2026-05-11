## Why the gaps exist

I dug into the three reference tables you flagged and the `ingest-reference-csv` edge function. Here is what actually happened on the previous CSV import:

- **Deliverables (118/118 missing)** — The CSV's description column header didn't match any of the strings the ingester looks for (it tries `Description`, `Deliverable Description`, `Description of the Workshop`, etc.). When no match is found, `descIdx = -1` and **every row gets an empty description**. Names imported fine; descriptions silently dropped.
- **Tools (16/17 missing)** — Same root cause. The Tools CSV used a header variant the ingester doesn't recognize.
- **Activities (4/101) & Duties (4/19)** — Mostly imported correctly; a handful of rows in the source CSV genuinely had blank description cells.
- **Skills (17 "gaps")** — These aren't real skills. They are leaked **category labels** ("Activity", "Tool", "Deliverable", "Stakeholder", …) that got upserted into `reference_skills` from a malformed CSV row. They should not be in this table at all.

In short: the ingester was too strict about header names and too quiet about failure. We fed it CSVs and it cheerfully wrote 118 nameless ghosts.

## Plan

### 1. Fix the ingester so this never happens again
**File:** `supabase/functions/ingest-reference-csv/index.ts`
- Expand description-header detection to match any header containing the word `description`, `definition`, `summary`, or `about` (case-insensitive), plus a fallback that picks the longest free-text column when no explicit match is found.
- Add a **hard validation step**: if `descIdx === -1` OR if more than 50% of imported rows end up with a blank description, return HTTP 422 with a clear error listing the headers it saw vs. the ones it expected. No more silent placeholder floods.
- Emit an `audit_log` entry per ingest run with: dataset, rows imported, rows with empty description, rows where existing description was preserved.

### 2. Re-ingest the CSVs you'll re-upload
- You re-upload Activities, Deliverables, Roles (Job Titles), and any others through `/admin/ingest`.
- The hardened ingester will populate `description` correctly. Existing admin edits remain protected by the placeholder-aware merge already in place.

### 3. Auto-fill remaining gaps with AI
**New edge function:** `fill-content-gaps` (admin-only, JWT-validated)
- Scans every `reference_*` table for rows where `description IS NULL`, blank, or `< 20 chars`.
- For each gap, builds a prompt using: row `name`, `category`, table type (e.g. "Tool", "Deliverable"), and 2–3 sibling rows from the same category as style anchors. Uses `google/gemini-2.5-flash-lite` via Lovable AI Gateway.
- Writes the generated copy back with `description_source='ai_generated'` and `description_generated_at = now()` (new columns) so admins can later filter "AI-written, needs review" in the Content Gaps tab.
- Batches 20 rows per call, ~150-word target per description, Tech Fleet voice.
- Runs once on demand via a button in **System Health → Content** ("Auto-fill all gaps"), with a confirmation dialog showing the count.

### 4. Clean up the 17 polluted Skills rows
**Migration:**
- Hard-delete the 17 leaked category-label rows from `reference_skills` (`Activity`, `Company Type`, `Deliverable`, `Duty`, `Industry`, `Job Function`, `Methodology`, `Practices`, `Product Milestone`, `Project`, `Resource`, `Skills`, `Specialization`, `Stakeholder`, `Tech Job Category`, `Tool`, `Workshop`).
- Add a CHECK on the ingester to reject any incoming Skills row whose `name` matches a known reference-table label.

### 5. Re-embed Fleety knowledge base
After ingest + AI fill:
- Trigger `fleety-embed` for every changed `framework://<slug>` row so Fleety answers reflect the new copy.
- Bump `kb_version` to invalidate semantic cache.

### 6. BDD scenarios (stored in `bdd_scenarios`)
- `CONTENT-INGEST-001` — CSV with unrecognized description header → 422 with helpful diff.
- `CONTENT-INGEST-002` — CSV with `Deliverable Description` (any variant) → 100% rows have descriptions.
- `CONTENT-FILL-001` — Admin clicks Auto-fill → all gaps filled, source flagged `ai_generated`.
- `CONTENT-FILL-002` — Re-ingest after AI fill → admin/AI descriptions preserved (placeholder merge).
- `CONTENT-SKILLS-001` — Leaked category labels removed; future ingest of same labels is rejected.

### Order of execution after you approve
1. Migration: add `description_source`, `description_generated_at` columns; delete 17 polluted skills rows.
2. Harden `ingest-reference-csv` + deploy.
3. You re-upload the CSVs at `/admin/ingest`.
4. I run `fill-content-gaps` to close any remaining gaps.
5. Re-embed Fleety; insert BDD rows; update `mem://features/content-gaps.md`.

## One quick check before I build

Do you want AI-generated descriptions to **publish immediately** (visible to all users, flagged for admin review), or land in a **"pending review" queue** that only appears after you approve them in the Content Gaps tab?