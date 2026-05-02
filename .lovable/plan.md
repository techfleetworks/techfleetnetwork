# Show project-level summary in "About the Client" on the Project Openings detail page

## What's wrong now

On `/project-openings/:id` (`src/pages/ProjectOpeningDetailPage.tsx`), the **About the Client** section renders a **Project Summary** row sourced from `client.project_summary` — i.e. the client-level summary that's shared across every project for that organization. This causes the same summary to appear under unrelated projects.

The project's own summary lives on `projects.description` (already collected in `ProjectFormPage` as the "Project Description" field, max 5,000 chars). It's already shown at the top of the page in the hero block, but the "Project Summary" row inside "About the Client" still pulls the client-level copy.

## Change

In `src/pages/ProjectOpeningDetailPage.tsx`, inside the **About the Client** `<InfoSection>` (around lines 316–318):

- Replace the `client.project_summary` source for the **Project Summary** row with `project.description`.
- Render the row only when `project.description?.trim()` is non-empty.
- Keep all other client rows (Organization, Mission, Website, Primary Contact) untouched — those are correctly client-level.

No schema, service, or query changes — `project.description` is already loaded by the page.

## BDD scenarios (will be inserted into `bdd_scenarios`)

`PROJ-DETAIL-CLIENT-SUMMARY-01` — Project-specific summary appears in About the Client
- Given an admin sets a project's Description to `"Phase 2 discovery for the new portal"`
- And the client's `project_summary` is `"We help nonprofits"`
- When a member opens the project opening detail page
- Then [UI] the **About the Client → Project Summary** row shows `"Phase 2 discovery for the new portal"`
- And [UI] it does NOT show `"We help nonprofits"`
- And [DB] `projects.description` is unchanged
- And [Code] the component reads `project.description` (not `client.project_summary`) for that row

`PROJ-DETAIL-CLIENT-SUMMARY-02` — Empty project description hides the row
- Given a project's `description` is empty/null
- When a member opens the project opening detail page
- Then [UI] the "Project Summary" row inside **About the Client** is not rendered
- And [UI] the rest of About the Client (Organization, Mission, Website, Primary Contact) still renders normally
- And [Code] the conditional `project.description?.trim()` returns false and skips the `DetailRow`

## Files touched

- `src/pages/ProjectOpeningDetailPage.tsx` (one `DetailRow` swap inside the About the Client section)
- `bdd_scenarios` table (insert two scenarios above)

## Out of scope

- `MyProjectsTab.tsx` — does not have a "Project Summary" row inside About the Client (it already shows project description in the hero), so no change needed there.
- The hero block's fallback (`client.project_summary`) when `project.description` is empty stays as-is unless you want it removed too — say the word and I'll drop the fallback.
