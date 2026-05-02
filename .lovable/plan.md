# Skills & Practices Framework — Final Build Plan

The PDF is fully parsed. **135 unique directed relationship pairs across 13 entities, 134 with reciprocal inverses.** Output staged at `/mnt/documents/framework-relationships.json`. SQL upserts staged at `/tmp/all_seeds.sql`. React Flow already installed. Approval = build proceeds end-to-end.

## What gets shipped on approval

### 1. Database (one migration)
- **5 new reference tables** (mirror existing 14): `reference_projects`, `reference_stakeholders`, `reference_job_titles`, `reference_resources`, `reference_roles` — same shape (`slug/name/description/category/data jsonb/search_tsv/is_active`), same RLS (authenticated SELECT, admin ALL), same indexes/triggers.
- **`reference_relationships` table**: `(id, from_entity, to_entity, description, inverse_description, all_descriptions jsonb, source, is_active, created_at, updated_at)`. UNIQUE `(from_entity, to_entity)`. CHECK constraints prevent self-loops and enforce snake_case entity keys. Same RLS pattern.
- **Seed**: 5 canonical definition rows in the new entity tables + 135 relationship rows from the PDF, idempotent via `ON CONFLICT`.

### 2. Reference CSV data
- The existing 14 `reference_*` tables are still empty. The migration alone doesn't populate them — that's done by **clicking "Sync All Reference Tables" once at `/admin/ingest`** (already built last round). I'll surface a one-line note in the new tab telling admins to do this if it hasn't happened. Once clicked, all 14 tables fill from the existing CSVs.

### 3. Frontend code

**Services / hooks** (new):
- `src/services/framework.service.ts` — types `FrameworkEntity`, `FrameworkRelationship`, plus `listRelationships()` and `getRelationship(from,to)`. Exports `FRAMEWORK_ENTITIES`, `FRAMEWORK_LABELS`, `FRAMEWORK_GROUPS` (Foundational / Project / Career).
- `src/hooks/use-framework.ts` — React Query, 24h staleTime, 7d gcTime.
- `src/services/reference.service.ts` — extend `ReferenceEntity` union with the 5 new entities (no API change for existing callers).

**Resources tab** — new tab "Skills & Practices" between Explore and Handbooks (`Puzzle` icon, deep-linkable via `?tab=skills-practices`):

```
src/components/resources/skills-practices/
  SkillsPracticesTab.tsx       — orchestrates 3 sub-views, URL state
  BrowseView.tsx               — entity rail (3 groups) + search + grid → detail panel
  MapView.tsx                  — React Flow canvas, Overview + Focus modes (lazy loaded)
  RelationshipsView.tsx        — pick A + B → render both directional sentences side-by-side
  PuzzleNode.tsx               — custom React Flow node, puzzle-piece CSS aesthetic
  EntityDetailPanel.tsx        — wraps ResourceDetailPanel; relationship chips link cross-entity
  framework-intro.tsx          — collapsible header with the 3 Medium article links
```

Three sub-views (segmented control):
1. **Browse** — Entity rail grouped Foundational / Project / Career. Live search across name+description (debounced 200 ms, ilike). Click a card → `EntityDetailPanel` showing all fields + chips for related entities.
2. **Map** — React Flow with custom puzzle-piece nodes. Two modes: **Overview** (13 entity nodes + edges from `reference_relationships`, edge labels reveal sentence on hover/focus) and **Focus on item** (centers a chosen item, shows one-hop neighbours). Pan/zoom, fit-to-view, full keyboard navigation, `prefers-reduced-motion` honoured. Code-split via `React.lazy` so the ~80 KB bundle is paid only when this tab opens.
3. **Relationships** — two `Select` dropdowns (Entity A, Entity B) → renders `description` and `inverse_description` side by side with the source entity definitions.

### 4. BDD scenarios (inserted into `bdd_scenarios`)
Tri-layer Then-clauses tagged [UI]/[DB]/[Code], scenario IDs `RES-SP-001..009`:
- `001` Tab appears between Explore and Handbooks
- `002` Browse lists all 13 entities with counts
- `003` Cross-entity search returns hits across multiple tables
- `004` Map Overview renders 13 nodes with edges from `reference_relationships`
- `005` Map Focus mode on a Skill renders one-hop neighbours only
- `006` Relationships view returns both directional sentences
- `007` Empty `reference_*` tables surface admin instruction (no error)
- `008` Deep link `?tab=skills-practices&entity=practices&item=agility` opens correct detail
- `009` Map nodes are keyboard-Tab navigable with visible focus rings (a11y)

### 5. Memory updates
- New: `mem://features/resources/skills-practices` (tab structure + relationships table).
- Index gets one new line; rest preserved.

## Use cases — coverage check

| Your use case | Where covered |
|---|---|
| Review data components of each level | Browse + EntityDetailPanel |
| Visual representation of how each component relates | Map (Overview + Focus) |
| Learn the two-way relationship between A and B | Relationships sub-view |
| See how each piece relates to others | Map Focus mode + relationship chips in detail panel |

## Effects (now confirmed against extracted data)

- **Security**: PDF content lives in RLS-protected DB, never shipped in the bundle. Anonymous users blocked.
- **UX**: Cross-entity navigation is one click. No relearning needed — same `ResourceDetailPanel` pattern as Handbooks/Workshops.
- **UI**: Puzzle-piece styling (per your reference image) using CSS, theme-aware in dark/light.
- **Performance**: 135 relationship rows + ~13 entity rows fits in 2 cached queries; map JS bundle code-split. React Query 24h staleTime keeps refetches near-zero.
- **Scalability**: Adding entity #14 = 1 new reference table + add to vocabulary + add rows to `reference_relationships`. No code rewrite.

## What you're approving

One migration (schema + seed of 135 relationships + 5 canonical entity rows), one new tab on `/resources` with 3 sub-views, services/hooks/components for the framework. No changes to any existing user-facing flow.

## Out of scope this round
- UI for editing reference data (admin write flow)
- Importing additional/custom relationship copy beyond the 135 PDF pairs
- Adding entities not in the PDF
