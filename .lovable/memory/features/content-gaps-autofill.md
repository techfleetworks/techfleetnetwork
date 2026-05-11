---
name: Content Gaps Auto-Fill
description: AI auto-fill for missing reference_* descriptions; ingester rejects CSVs lacking a description column; admin edits always preserved over CSV/AI overwrites
type: feature
---
- `description_source` ∈ {csv, admin, ai_generated, missing} on every reference_* table; `description_generated_at` records AI fills.
- `ingest-reference-csv` returns 422 if no description column found OR if >50% rows would be empty; description headers detected via /\b(description|definition|summary|about|overview)\b/i.
- Merge precedence on re-ingest: admin > csv (real) > ai_generated > placeholder. CSV with real value overrides ai_generated; admin edits always preserved.
- `reference_skills` BEFORE INSERT trigger `block_skills_category_labels` silently drops 17 reserved labels (Activity, Tool, Deliverable, …) — they leaked from a malformed CSV row historically.
- Admin Auto-fill: System Health → Content → "Auto-fill all with AI" invokes `fill-content-gaps` edge fn (admin JWT required) → batches of 10 to Lovable AI gateway (`google/gemini-2.5-flash`, structured tool output) → marks rows `description_source='ai_generated'` → triggers fleety-embed re-index for changed slugs.
- BDD: CONTENT-INGEST-001/002, CONTENT-FILL-001/002, CONTENT-SKILLS-001.
