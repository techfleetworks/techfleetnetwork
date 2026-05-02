
# Framework Relationships → Fleety Knowledge + Career Development Engine

The 136 directional relationship sentences (and the 14 reference entity tables) are currently siloed inside `reference_relationships`. They power one tab in /resources but nothing else. This plan makes them a first-class data layer used by **(a) Fleety**, **(b) every user via a connected "Career Plan" surface**, and **(c) admins / future automations** — without touching the rename we just did.

---

## 1. Make relationships discoverable to Fleety (knowledge layer)

Fleety reads `knowledge_base` (430 rows, cached 5 min per isolate). Today it cannot answer "what skills do I need to be a Product Manager?" because the framework lives in a different table.

**Add a deterministic projection of the framework into `knowledge_base`** so Fleety's existing retrieval just works — no edge-function changes required.

- New trigger function `sync_framework_to_knowledge_base()` runs on `INSERT/UPDATE/DELETE` of `reference_relationships`, `reference_skills`, `reference_practices`, `reference_activities`, `reference_duties`, `reference_deliverables`, `reference_tools`, `reference_project_milestones`, `reference_projects`, `reference_stakeholders`, `reference_job_specializations`, `reference_job_titles`, `reference_resources`, `reference_roles`.
- It writes/refreshes rows in `knowledge_base` namespaced by URL prefix:
  - `framework://entity/<entity_key>/<slug>` — one row per reference item with `title = "<Label>: <name>"` and `content = <description> + bidirectional sentence list pulled from `reference_relationships` for that entity`.
  - `framework://relationship/<from>/<to>` — one row per directed pair holding both sentences plus the `all_descriptions[]` alternates.
  - `framework://overview` — one summary row listing the 13 entity labels + definitions, refreshed nightly.
- Stale framework rows (any with URL starting `framework://` whose source pair no longer exists) are deleted in the same trigger.
- Uses a `SECURITY DEFINER` function with `SET search_path = public` (matches existing project conventions). RLS unchanged — `knowledge_base` is already authenticated-readable.

After this, Fleety's existing 5-minute KB cache will start surfacing framework facts in answers without any prompt or function changes. We'll also add a one-line nudge to Fleety's system prompt: "When the user asks about a Tech Fleet skill, role, activity, or career path, prefer entries whose URL starts with `framework://`."

---

## 2. Make relationships visible & navigable to users (UI layer)

Today the Skills & Practices tab shows entities and pairwise sentences. Users still can't drill from "PM job title → which skills?" in one click.

**Upgrade the existing Browse view inside `/resources` → Skills & Practices** so each entity card is now a hyperlink to a focused detail panel:

- Click any reference item (e.g. "Product Manager") → opens a side sheet with three sections:
  1. **Definition** — from the entity's row.
  2. **What it connects to** — grouped by related entity, each section listing the bidirectional sentence and a list of items in that related table (e.g. for a job title: which skills, duties, milestones it relates to).
  3. **Add to my Career Plan** — single button (see §3).
- The Map view gains a "Focus mode": clicking a node highlights only that node's edges and dims the rest, with a side caption showing all sentences in/out.
- Relationships view stays as-is — already works for the renamed terminology.

No new pages. Same tab, deeper drill-down. Mobile-parity preserved.

---

## 3. Career Development Plan — the killer surface

A new `/journey/career-plan` page (linked from the existing Journey/Quest area). The relationship graph is the engine.

### Data model (one new user-scoped table)

`career_plans`
- `id`, `user_id` (PK = `user_id`, one plan per user), `target_job_title_id`, `target_specialization_id` (nullable), `target_role_id` (nullable)
- `current_skills` jsonb (array of `reference_skills.id` the user has self-rated 1–5)
- `current_practices` jsonb (same shape)
- `notes` text, `created_at`, `updated_at`

`career_plan_items` (the generated checklist — regenerated when the target or self-rating changes)
- `id`, `plan_id`, `item_type` (`skill | practice | activity | deliverable | milestone | resource`), `reference_id`, `priority` (1–5), `status` (`not_started | in_progress | done`), `auto_generated` boolean, `rationale` text (the relationship sentence that justifies the item).

RLS: owner-only read/write, admins read-all.

### Generation logic (server-side, deterministic)

When the user picks a target (e.g. job title = "Product Manager"):

1. Fetch every `reference_relationships` row where `from_entity = 'job_titles'` and the `to_entity` ∈ {`skills`, `practices`, `duties`, `activities`, `deliverables`, `project_milestones`, `resources`} AND the related items are linked to that specific job title (via the per-entity reference rows, which already carry job-title arrays where applicable).
2. For each related entity, list the items the user does NOT yet self-rate ≥3 → push them into `career_plan_items` with `rationale` = the directional sentence (e.g. *"Job titles drive requirements for technical and interpersonal skills"*).
3. Group results in the UI by entity with progress bars and a "Mark as in progress / done" button.
4. Re-running generation is idempotent (upsert by `(plan_id, item_type, reference_id)`).

Edge function `generate-career-plan` runs the logic, validates the JWT, uses the user's `auth.uid()` and the service-role client only for cross-table reads. Returns the generated plan in one round-trip.

### UI

- Step 1 — pick target (3 dropdowns: job title required, specialization + role optional).
- Step 2 — quick self-rating grid for skills + practices (slider 0–5, only the items connected to the chosen target are shown so the form stays short).
- Step 3 — generated plan grouped by entity, each item showing its rationale sentence, status toggle, and a "Why this?" tooltip linking back to the framework relationship.
- Persistent banner at top: *"Your plan is generated from the Skills & Practices Framework. Targets: <job title> → <N skills, M practices, K activities>."*
- Card view default (per project memory). Dark-themed, WCAG AA contrast, mobile responsive.

### Fleety integration (re-uses §1)

Because every plan item carries an `item_type` + `reference_id`, Fleety can answer:
- "What's next on my career plan?" → reads `career_plan_items` (new RLS-safe view) + framework KB rows.
- "Why is X on my plan?" → returns the stored `rationale`.

A new `getCareerPlan(userId)` tool is exposed inside the chat function (already supports tools), and the system prompt gets a sentence pointing at it.

---

## 4. BDD scenarios (mandatory)

- `RES-SP-011 [Code/DB]` — every reference row produces a `framework://entity/...` row in `knowledge_base`; deletes cascade.
- `RES-SP-012 [DB]` — every `reference_relationships` row produces a `framework://relationship/...` row containing both sentences.
- `CAR-PLN-001 [UI/DB/Code]` — picking a target generates ≥1 plan item per related entity, each with a non-empty rationale sentence drawn from `reference_relationships`.
- `CAR-PLN-002 [UI/DB]` — re-running generation is idempotent (no duplicate `(plan_id, item_type, reference_id)` rows).
- `CAR-PLN-003 [Code]` — `generate-career-plan` rejects requests without a valid JWT.
- `FLEETY-FRAMEWORK-001 [Code]` — Fleety system prompt instructs preference for `framework://` KB rows; KB cache TTL unchanged.

---

## 5. Memory updates

- `mem://features/journey/career-plan` — new feature note (target → self-rate → generated checklist, regenerated on change, rationale stored per item).
- `mem://features/chatbot/fleety` — append: Fleety reads framework projections from `knowledge_base` under `framework://` URLs; do not query reference tables directly.
- `mem://features/resources/skills-practices` — append: Browse-view items open a detail sheet; framework rows are mirrored to `knowledge_base` via trigger; do not write to `framework://` URLs by hand.
- `mem://index.md` — add the two new entries.

---

## Files & migrations

**Migration (schema):**
- `career_plans`, `career_plan_items` tables + RLS + `updated_at` triggers.
- `sync_framework_to_knowledge_base()` function + 14 row-level triggers.
- One-time backfill statement at end of migration to populate `knowledge_base` for all existing reference rows.

**Edge functions (new):**
- `generate-career-plan` — JWT-validated, deterministic, idempotent.

**Edge function (edit):**
- `techfleet-chat/index.ts` — append one sentence to system prompt; register a `getCareerPlan` tool.

**Frontend (new):**
- `src/pages/CareerPlanPage.tsx`
- `src/components/career-plan/TargetPicker.tsx`, `SelfRatingGrid.tsx`, `PlanItemList.tsx`
- `src/components/resources/skills-practices/EntityDetailSheet.tsx`
- `src/services/career-plan.service.ts`, `src/hooks/use-career-plan.ts`

**Frontend (edit):**
- `src/components/resources/SkillsPracticesTab.tsx` — wire up detail-sheet click handler.
- `src/components/resources/skills-practices/MapView.tsx` — focus mode.
- Sidebar navigation — add "Career Plan" link under Journey group (alphabetized per memory rule).

**BDD:** 6 new rows in `bdd_scenarios`.

**Out of scope:** auto-generated plans for cohorts, manager/coach views, AI-generated rationale (we use the deterministic relationship sentences). Those are follow-ups.

---

## Performance & security

- KB grows by ~13 entity-overview rows + ~N reference rows + 136 relationship rows ≈ +400 rows total. Well within the 5-min cache and the 1000-row Supabase fetch limit (KB is paginated by `.order` already; will switch to ranged fetch in `loadKnowledgeBaseCached` to be safe).
- Triggers are `BEFORE`/`AFTER ROW` inserts — O(1) per write, no table scans.
- All new edge function endpoints validate JWT (per Core memory). RLS owner-only on plan tables. No PII is sent to the AI gateway.
- WCAG: focus-mode keyboard navigable, all sliders have visible labels and ARIA value text, plan items announce status changes via toast.
