## Goal

Remove premature UI surfaces (Career Plan, Map view, Relationships view) without touching the underlying framework data, knowledge base sync, or reference tables. Skills & Practices tab keeps its **Overview** and **Browse** sub-tabs.

## What gets removed

**Frontend (delete files):**
- `src/pages/CareerPlanPage.tsx`
- `src/hooks/use-career-plan.ts`
- `src/services/career-plan.service.ts`
- `src/components/resources/skills-practices/MapView.tsx`
- `src/components/career-plan/` (any contents — placeholder dir from prior plan)

**Frontend (edits):**
- `src/App.tsx` — remove the `CareerPlanPage` lazy import and the `/career-plan` route.
- `src/components/AppSidebar.tsx` — remove the "Career Plan" nav entry (and the now-unused `Compass` icon import if no longer referenced).
- `src/components/resources/SkillsPracticesTab.tsx`:
  - Remove `Map` and `Relationships` `TabsTrigger`s and their `TabsContent` blocks.
  - Remove `MapView` lazy import, the `RelationshipsView` / `EntitySelect` / `RelationshipCard` components, and unused imports (`Network`, `GitBranch`, `Select*`, `useFrameworkRelationships`, `FRAMEWORK_ENTITIES`, `useMemo`, `lazy`, `Suspense`, `Loader2` if unused).
  - In `OverviewView`, remove the two list items that link to Map and Relationships, keeping only the Browse item. Adjust intro copy accordingly.

**Backend (edge function):**
- Delete `supabase/functions/generate-career-plan/` entirely (and its `supabase/config.toml` block if one exists).

**Database (new migration):**
- `DROP TABLE IF EXISTS public.career_plan_items CASCADE;`
- `DROP TABLE IF EXISTS public.career_plans CASCADE;`
- Drop any associated triggers, RLS policies, and `updated_at` helpers exclusive to those tables.
- Remove BDD scenarios `CAR-PLN-001/002/003` and `FLEETY-FRAMEWORK-001` from `bdd_scenarios` (the framework KB sync remains, but that scenario referenced the career-plan flow).

## What stays untouched

- All `reference_*` tables, `reference_relationships`, `framework_entity_v`, `framework_overview_mv`, RLS, grants.
- `knowledge_base` rows under `framework://` and the `sync_framework_to_knowledge_base()` trigger (Fleety keeps its enriched answers).
- `src/services/framework.service.ts`, `src/hooks/use-framework.ts`, `src/services/reference.service.ts`.
- `SkillsPracticesTab` Overview + Browse sub-views and all framework data displayed there.
- BDD scenarios `RES-SP-011/012/013/014`.

## BDD updates

- Add `RES-SP-015 [UI]`: Skills & Practices tab exposes only Overview and Browse sub-tabs; Map and Relationships are not rendered.
- Add `NAV-001 [UI]`: Sidebar does not include a "Career Plan" entry; `/career-plan` route returns the NotFound page.

## Memory updates

- Delete `mem://features/journey/career-plan`.
- Update `mem://features/chatbot/fleety` — keep the note about Fleety reading `framework://` KB rows; remove any career-plan tool reference.
- Update `mem://index.md` — remove the "Career Plan" entry; leave Skills & Practices references intact.

## Verification

- Build passes; no dangling imports.
- `/career-plan` no longer routable; sidebar clean.
- Skills & Practices tab: Overview loads; Browse still lists 115 skills, 7 practices, etc.
- Supabase linter shows no new warnings.
