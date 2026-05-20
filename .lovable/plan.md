## Goal

Tech Fleet uses **service leadership**, never *servant leadership*. Replace every variant across the app's content.

## Audit results

**Source code** (`rg -in "servant.{0,3}lead"`): **0 matches** — no React, TS, edge function, SQL migration, doc, or test references this term. Good news: no UI strings to change.

**Database — `knowledge_base` table only** (all other content tables scanned and clean: `fleety_playbooks`, `fleety_examples`, `announcements`, `admin_banners`, `classes`, `cohorts`, all `reference_*`, `bdd_scenarios`, `content_blocks`, etc.):

| Variant | Occurrences |
|---|---|
| `Servant Leadership` | 27 |
| `servant leaders` | 7 |
| `servant leadership` | 7 |
| `servant leader` | 4 |
| `Servant leadership` | 3 |
| `Servant Leader` | 3 |
| `servant-leadership` | 1 |
| **Total** | **52 substring hits across ~25 rows** |

No matches in `title`, only in `content`.

**Storage / other layers**: no PDFs or markdown in `/docs` reference the term; nothing in edge functions; nothing in `network_stats_historical` (the `service_leadership_unique` metric key is already correctly named).

## Plan

### 1) Case-preserving DB rewrite (single migration, transactional)

Run on `knowledge_base.content` with `regexp_replace(..., 'g')` for each variant, preserving capitalization:

```sql
UPDATE knowledge_base
SET content = regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(content,
                      'Servant Leadership', 'Service Leadership', 'g'),
                    'Servant leadership', 'Service leadership', 'g'),
                  'servant leadership', 'service leadership', 'g'),
                'servant-leadership', 'service-leadership', 'g')
WHERE content ~* 'servant[- ]leadership';

UPDATE knowledge_base
SET content = regexp_replace(
                regexp_replace(
                  regexp_replace(content,
                    'Servant Leaders', 'Service Leaders', 'g'),
                  'Servant Leader', 'Service Leader', 'g'),
                'servant leaders', 'service leaders', 'g')
WHERE content ~* 'servant leader';

UPDATE knowledge_base
SET content = regexp_replace(content, 'servant leader', 'service leader', 'g')
WHERE content ~* 'servant leader';
```

Notes:
- Only `content` is mutated. `title` has zero hits.
- Verified zero matches in every other text/jsonb column across `public.*`.
- Migration logs the affected row count for the audit trail.
- Re-embedding: `knowledge_base` rows feed Fleety via `framework://` sync. Bumping `updated_at` on the touched rows will trigger the existing `trg_kb_bump_version` so Fleety re-embeds on next sync — no extra code needed.

### 2) Post-write verification (same migration)

```sql
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM knowledge_base WHERE content ~* 'servant[- ]?leader';
  IF n > 0 THEN RAISE EXCEPTION 'servant-leadership leak: % rows', n; END IF;
END $$;
```

### 3) Guardrail (brand-terms lint)

Add `servant leadership`, `servant leader`, `servant-leadership` (case-insensitive) to the existing ESLint `brand-terms/no-banned-terms` banned list with the autofix → `service leadership`. This is the same enforcement layer used for "TechFleet", "click here", etc., so any future code or content imports get caught.

### 4) BDD scenario

Add one row to `bdd_scenarios` (feature_area = `Brand Voice`):
- `BRAND-SERVICE-LEAD-001` — Given any knowledge_base row containing "servant leadership", When the brand-terms scan runs, Then [DB] no row matches `servant[- ]?leader`, [Code] ESLint flags it as error, [UI] no rendered text in Fleety responses or guides contains the banned variant.

### 5) Memory

Update the existing **Brand Voice** core memory line to explicitly list "servant leadership / servant leader" as banned terms → use **service leadership / service leader**.

## Out of scope

- The historical metric key `service_leadership_unique` (already correct).
- Renaming any DB columns or storage buckets — none use the term.
- Editing external sources (guide.techfleet.org) referenced from `knowledge_base` URLs.
