# Show project friendly name as a sub-heading everywhere

## What you're asking for

Wherever a project opening surfaces (whether the user has applied or not), show the **client (organization) name as the primary heading** and the **project's friendly name as a secondary line directly underneath** — not crammed onto the same line with an em-dash, the way most surfaces do today.

## Audit — every place this needs to change

`projects.friendly_name` is already in the database (max 200 chars), and most queries already select it. The audit found these surfaces:

| # | Surface | File | Today | After |
|---|---------|------|-------|-------|
| 1 | Opening detail hero header | `src/pages/ProjectOpeningDetailPage.tsx` (~278) | `Acme — Mobile App` inline | Acme on line 1, Mobile App on line 2 |
| 2 | Openings list cards | `src/pages/ProjectOpeningsPage.tsx` (~286) | inline em-dash | two-line |
| 3 | Apply form headline (page header) | `src/pages/ProjectApplicationPage.tsx` (~256) | inline em-dash | two-line via existing `description` slot |
| 4 | Apply form Step 1 review card | `src/pages/ProjectApplicationPage.tsx` (~552) | client name only | add friendly name underneath |
| 5 | "Application Submitted!" celebration dialog | `src/pages/ProjectApplicationPage.tsx` (~838) | "for {client.name}" | "for {client.name} — {friendly_name}" |
| 6 | My Project Applications page (cards + grid) | `src/pages/MyProjectApplicationsPage.tsx` (~149, 343) | client name only | add friendly name |
| 7 | Application Status timeline page header | `src/pages/ProjectApplicationStatusPage.tsx` (~610, 897, 948) | client name only | add friendly name + extend query to fetch it |
| 8 | Active Teammate celebration banner | `src/pages/ProjectApplicationStatusPage.tsx` (~246) | client name only | add friendly name |
| 9 | Submitted Applications admin tab (cards + grid column) | `src/components/SubmittedApplicationsTab.tsx` (~266, 421) | client name only | add friendly name + new "Project" grid column |
| 10 | Application submission detail (admin review) | `src/pages/ApplicationSubmissionDetailPage.tsx` (~158, 261) | client name only | add friendly name |
| 11 | My Projects tab (active project cards) | `src/components/MyProjectsTab.tsx` (~121, 201) | inline em-dash | two-line |
| 12 | Dashboard "My Project Apps" widget | `src/pages/DashboardPage.tsx` (~542) | client name only | add friendly name + extend query |

Out of scope (not user-facing project-opening surfaces): admin Roster pages, Project Coordination, Project Form (edit), Discord role assignment, Quest Roadmap (uses different naming).

## Approach

### 1. New shared component — single source of truth

`src/components/projects/ProjectOpeningHeading.tsx`

```tsx
<ProjectOpeningHeading
  clientName={client?.name}
  friendlyName={project?.friendly_name}
  size="lg"            // sm | md | lg | xl
  as="h1"              // h1 | h2 | h3 | div
  truncate             // for cards
/>
```

Renders:

```text
Acme Healthcare              ← bold, primary text
Patient Portal Redesign      ← muted, smaller, mt-0.5
```

Friendly-name line is suppressed when empty/whitespace. Built-in `aria-label="Project: <name>"` for screen readers, and a `truncate` mode for cards.

### 2. Replace inline `Client — Friendly` patterns with the component

All 12 surfaces above swap their handcrafted `<h1>/<CardTitle>/<p>` blob for `<ProjectOpeningHeading … />`. This guarantees consistent visual hierarchy site-wide and lets us tweak typography in one place later.

### 3. Extend two queries that don't currently fetch `friendly_name`

- `DashboardPage.tsx` line 212: add `friendly_name` to the projects select.
- `ProjectApplicationStatusPage.tsx` line 400: add `friendly_name` to the projects select.

(Submitted Applications, My Project Applications, Submission Detail, Opening Detail, Openings List, Apply, MyProjects all use `select("*")` already.)

### 4. AG Grid: new sortable "Project" column

In `SubmittedApplicationsTab.tsx` and `MyProjectApplicationsPage.tsx`, add a new column right after "Client":

```ts
{ headerName: "Project", colId: "project_friendly", flex: 1,
  valueGetter: (p) => p.data?.project?.friendly_name || "—" }
```

Hidden by default in admin grid (matches the column-picker pattern), shown by default in the user-facing "My Applications" grid.

### 5. Toast / dialog copy

The "Application Submitted!" dialog becomes:

> Your application for **Acme Healthcare — Patient Portal Redesign** has been submitted successfully…

If `friendly_name` is empty the em-dash and project name are omitted, so the wording stays clean for projects that don't have one.

## BDD scenarios (inserted into `bdd_scenarios`)

- `PROJ-OPENING-NAME-01` — Opening detail hero shows friendly name as a separate line below client name; missing friendly name hides the second line.
- `PROJ-OPENING-NAME-02` — Project Openings card title renders client name with friendly name as a muted sub-line; both truncate without overflow on mobile.
- `PROJ-OPENING-NAME-03` — Apply form page header description shows `Client — Friendly` and the Step 1 review card shows two-line heading.
- `PROJ-OPENING-NAME-04` — "Application Submitted!" dialog references `{client} — {friendly}` when friendly name is set, only `{client}` otherwise.
- `PROJ-OPENING-NAME-05` — My Project Applications cards show friendly name; AG Grid has visible "Project" column with friendly name values.
- `PROJ-OPENING-NAME-06` — Project Application Status timeline page header and Active-Teammate banner show friendly name on a second line.
- `PROJ-OPENING-NAME-07` — Submitted Applications admin tab shows friendly name on cards and the new "Project" column appears in the column picker.
- `PROJ-OPENING-NAME-08` — Dashboard "My Project Applications" widget rows show client name with friendly name underneath.
- `PROJ-OPENING-NAME-09` — All occurrences gracefully handle empty/whitespace `friendly_name` (no stray em-dashes, no empty `<p>` tags rendered).
- `PROJ-OPENING-NAME-10` — `[DB]` Both modified queries (`DashboardPage`, `ProjectApplicationStatusPage`) include `friendly_name` in the projects column list, and `[Code]` no surface depends on inline `${client.name} — ${friendly}` string concatenation.

Each scenario will include explicit `[UI]`, `[DB]`, and `[Code]` Then-clauses per the project standard.

## Files changed

- New: `src/components/projects/ProjectOpeningHeading.tsx`
- Edits (12 surfaces):
  - `src/pages/ProjectOpeningDetailPage.tsx`
  - `src/pages/ProjectOpeningsPage.tsx`
  - `src/pages/ProjectApplicationPage.tsx` (3 spots)
  - `src/pages/MyProjectApplicationsPage.tsx`
  - `src/pages/ProjectApplicationStatusPage.tsx` (+ query)
  - `src/components/SubmittedApplicationsTab.tsx` (+ grid column)
  - `src/pages/ApplicationSubmissionDetailPage.tsx`
  - `src/components/MyProjectsTab.tsx`
  - `src/pages/DashboardPage.tsx` (+ query)
- BDD inserts via `supabase--migration` data insert.

## Out of scope

- Admin Roster pages, Project Coordination tab, Project edit form (already use friendly_name distinctly).
- Renaming `friendly_name` column or adding a new field.
- Changing the "About the Client" project-summary row done in the prior turn.
