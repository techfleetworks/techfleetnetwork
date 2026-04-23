

# Loading Detailed Workshop PDFs into Fleety's Knowledge Base

You have detailed PDFs for every workshop template. Today Fleety only knows the short CSV row per workshop (name, category, one-line description, figma link, etc.), which is why answers feel shallow. We need to get the full nuance from those PDFs into the `knowledge_base` table that Fleety reads on every question.

## Best way to send me the content

Send me the **PDFs themselves** as uploads in chat (you can attach up to 10 files per message, 20MB each). I have a document parser that extracts text, tables, and embedded images from PDFs and PPTX files with high fidelity — including headings, bullet lists, and step-by-step instructions. That's much better than you copy-pasting into Word, because:

- I keep the structure (sections, steps, sub-steps) instead of a flat blob.
- I can OCR any embedded screenshots of the Figma template.
- One workshop = one knowledge base entry, cleanly named.

If a workshop has a companion **Word doc, Notion export, or Google Doc PDF** with extra facilitator notes, send those alongside the workshop PDF and I'll merge them into the same entry.

**Batching:** Send them in groups of ~8 PDFs per message. If you have 30+ workshops, we'll do it across a few messages. You don't need to rename the files — I'll match them to existing workshop names.

## What I'll build (once you approve and start sending PDFs)

### 1. Workshop document ingest pipeline
- New admin-only edge function `ingest-workshop-docs` that accepts parsed workshop content (title + structured markdown) and upserts into `knowledge_base` keyed by `workshop://<slug>`.
- Each entry will follow a consistent template so Fleety can pattern-match:
  ```text
  # <Workshop Name>
  **Category:** ...
  **Led by:** ...
  **When:** Before/During/After ...
  ## Goals
  ## Scope
  ## Who's Involved
  ## Step-by-Step Facilitation Guide
    ### Step 1: ...
    ### Step 2: ...
  ## Deliverables Produced
  ## Skills Used
  ## Tips & Common Pitfalls
  ## Figma Template
  ## Related Milestones
  ```
- Preserves the existing `Workshop Preview Image` markdown image tag so Fleety still shows the preview.

### 2. Admin UI to upload PDFs
- Add a **"Workshop Documents"** section to `/admin/ingest` (`AdminIngestPage.tsx`) with a drag-and-drop file picker.
- For each PDF: shows parsing progress, the extracted title (editable), and a preview of the structured markdown before upsert.
- Per-file status (pending → parsing → parsed → upserted / error), plus a "Re-ingest all" button for when you update a template.

### 3. Sharper Fleety responses
Tweaks to `techfleet-chat`'s system prompt so that when a user asks how to run a workshop, Fleety:
- Pulls the **full structured workshop entry** (not just the one-line CSV summary) when one exists.
- Walks through the step-by-step facilitation guide in order, not as a bulleted summary.
- Cites the workshop entry plus any web tips separately, as it does today.
- Keeps the existing 5-minute KB cache so cost doesn't increase.

### 4. Updates to memory
- Add `mem://features/chatbot/workshop-knowledge` describing the workshop entry schema, slug convention (`workshop://<slug>`), and the "upload PDFs in /admin/ingest" workflow so future changes stay consistent.

## Technical details

- **Parsing:** Done by my `document--parse_document` tool at upload time inside the edge function flow — the client uploads the raw PDF bytes (base64 or multipart), the function calls a parsing helper, transforms the structured output into the markdown template above, then upserts.
- **Storage:** Reuses the existing `knowledge_base` table (no schema change). Existing CSV-derived workshop rows at `csv://workshops-(detailed)/<slug>` will be **kept** but the new richer `workshop://<slug>` entries take precedence in Fleety's answers because they're longer and more specific.
- **Auth:** Same admin-only JWT + `user_roles` check as `ingest-csv-knowledge`.
- **Size:** A typical detailed workshop PDF parses to 3–8 KB of markdown — well within KB and AI gateway limits even with 30+ workshops loaded.

## What you do next

1. Approve this plan.
2. In your next message, attach the first batch of workshop PDFs (up to 10). Once the pipeline is built, you'll also be able to upload them yourself from `/admin/ingest`.

## Out of scope

- Auto-syncing from a live Notion/Google Drive folder (possible follow-up if you'd rather maintain workshops there as the source of truth).
- A facilitator-facing "live workshop runner" UI — Fleety will guide via chat for now.

