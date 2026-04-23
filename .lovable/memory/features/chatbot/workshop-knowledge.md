---
name: Workshop knowledge ingestion
description: How detailed workshop PDFs flow into Fleety's knowledge base via /admin/ingest, and the workshop:// URL convention that triggers richer answers.
type: feature
---

Admins upload detailed workshop PDFs at `/admin/ingest` (Workshop Documents section, above the CSV ingestion list). Each PDF is parsed in the browser via `src/lib/pdf-to-markdown.ts` (uses `pdfjs-dist`, fake-worker mode for iframe safety) into structured markdown — admins can edit the title and markdown before upload.

The `ingest-workshop-docs` edge function (admin-only via JWT + `user_roles` check, `verify_jwt = false` in config to match the `ingest-csv-knowledge` pattern) upserts each doc into the `knowledge_base` table keyed by `workshop://<slug>`. Slugs come from `slugify(title)` and are capped at 120 chars.

Fleety (`techfleet-chat`) treats `workshop://` entries as authoritative facilitation guides:
- They sort first in the KB context so they fit before the 400KB cap
- Per-entry truncation is 12,000 chars for `workshop://` (vs 2,000 for `csv://` summaries) so step-by-step instructions survive intact
- The system prompt's "WORKSHOP DETAIL RULES" tell Fleety to prefer them over CSV summaries and walk through Step 1, Step 2, Goals, Outcomes sections in order

Sanitization on the server side strips `<script>`, `<iframe>`, `javascript:`, `on*=` handlers, and prompt-injection markers (`<|im_start|>`, `[SYSTEM]`) before persisting. Admins are trusted but defense-in-depth applies because the content is later embedded in Fleety's system prompt.

Re-uploading a workshop with the same title overwrites the entry (upsert on `url`). To rename, delete the old `workshop://<old-slug>` row first via SQL.
