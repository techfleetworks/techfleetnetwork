# Fix: Classes failing to save

## Root cause
DB error: `new row for relation "classes" violates check constraint "classes_summary_check"`.

The `classes` table has `CHECK (length(summary) BETWEEN 20 AND 600)`, but the client validator (`safeHtmlSchema("Summary", 10_000)`) allows 0–10,000 chars and gives no min/max guidance. Because Summary is rendered through `RichTextEditor`, the stored value is HTML (`<p>...</p>`) which inflates length quickly — users hit either the 20-char floor (empty editor) or 600-char ceiling without warning.

## Fix
1. **Migration** — relax the DB check to match the validator: `CHECK (length(summary) BETWEEN 1 AND 10000)`. Same as the other long-form HTML columns. Keeps a sanity bound, removes the silent rejection.
2. **No client/UI changes needed** — the form already passes summary as HTML; it will now save.

## Files
- New migration: `ALTER TABLE public.classes DROP CONSTRAINT classes_summary_check; ALTER TABLE public.classes ADD CONSTRAINT classes_summary_check CHECK (length(summary) BETWEEN 1 AND 10000);`

## Out of scope
- Reintroducing Description (user explicitly removed it).
- Title check (`3..160`) is already in line with the validator.
- BDD: existing class scenarios still apply; no new behavior.
