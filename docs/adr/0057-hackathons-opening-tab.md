# ADR 0057 — A "Hackathons" tab on Project Openings for Shipathon projects

- Status: Accepted
- Date: 2026-09-23
- Deciders: Morgan Denner
- Epic: Projects / Project Openings

## Context

Shipathon projects (`projects.is_shipathon = true`, ADR-0055) are a distinct kind of opening — a
cross-functional hackathon — that should be browsable on its own. The Project Openings page
(`ProjectOpeningsPage`) already partitions openings into two tabs, **Client Project Openings** and
**Volunteer Openings**, split by `clients.kind` (external vs internal), each rendered by the shared
`OpeningsTabContent` with status sub-sections (Open Applications / Opening Soon / Starting Soon /
Live). Its data comes from the public, unauthenticated `public-project-openings` edge function, whose
`select` did not include `is_shipathon`.

## Decision

Add a third tab, **Hackathons**, listing Shipathon openings, reusing the existing
`OpeningsTabContent` renderer and status sub-sections (no new list component).

- **Exclusive placement.** A Shipathon appears **only** on the Hackathons tab and is filtered out of
  Client/Volunteer, so a project is never listed twice. The rule lives in one pure, tested function,
  `src/lib/projects/opening-category.ts` → `getOpeningCategory(project) → "hackathon" | "volunteer"
| "client"` (Shipathon wins first, then internal→volunteer, else client). Both the tab filters and
  the tab-count badges derive from it, so they can't drift.
- **Data.** `public-project-openings` now selects `is_shipathon`; it flows through the payload to the
  page. The edge function uses the service-role client, so it reads the column regardless of the
  column-scoped grant on `projects` (ADR-0056). Fail-safe: a missing/undefined flag is treated as
  "not a hackathon", so the opening falls back to its client/volunteer tab rather than vanishing.

## Alternatives considered

- **Additive (Shipathons also stay under Client/Volunteer).** Rejected as the default: the same
  opening in two tabs is confusing, and a dedicated tab exists precisely to separate them. Trivial to
  switch to if wanted (drop the `!hackathon` exclusion from the client/volunteer filters).
- **Inline the `is_shipathon ? … : clientKind …` ternary in each of the three filters.** Rejected:
  the same routing rule copied three times drifts; one pure `getOpeningCategory` is the single owner
  and is unit-tested.
- **A separate Hackathons page/route.** Rejected as heavier and less discoverable than a tab on the
  existing openings page; no new route or navigation entry needed.

## Consequences

- Shipathons are browsable on their own tab, with the same statuses, cards, table view, and per-tab
  stats as the other tabs. Non-Shipathon behavior is unchanged.
- `getOpeningCategory` is now the single source for opening→tab routing; a future opening category
  would extend it (and its unit test) rather than adding more inline filters.
- This PR touches an edge function, so it deploys via `deploy-edge-functions.yml` (separate from the
  Cloudflare Pages frontend). No migration and no new schema — `is_shipathon` already exists in prod
  (ADR-0055) — so there is no apply-first ordering hazard; the edge-function change is safe to ship
  before or after the frontend (an older frontend simply ignores the extra field).
