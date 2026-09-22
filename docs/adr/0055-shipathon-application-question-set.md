# ADR 0055 — Shipathon projects: a project-level flag that drives the application question set

- Status: Accepted
- Date: 2026-09-21
- Deciders: Morgan Denner
- Epic: Projects / Applications

## Context

"Shipathon" is a new kind of project — a cross-functional hackathon. Applicants still apply, but
two questions in the project application flow don't make sense for a one-off hackathon and are
removed:

1. Step 2 — **"Did you participate in a previous phase of this project?"** (a Yes/No radio that
   gates three follow-ups: previous-phase position, learnings, and how you'll help teammates). A
   Shipathon has no "previous phase," so the whole group goes. The standalone **"How has your prior
   engagement in Tech Fleet prepared you for this team role?"** question **stays** and becomes the
   sole Step-2 narrative for a Shipathon applicant.
2. Step 3 — **"What do you know about the client and the project that you're applying to?"**

Everything else about the application is unchanged.

This mirrors the existing `projects.requires_interview` flag (a project-level boolean, set by a
toggle in the project setup form, that changes downstream applicant behavior), which is the pattern
we were asked to duplicate.

The naive implementation — hide the inputs in the page and add `if (isShipathon)` guards wherever
convenient — has a specific, severe failure mode: the submit gate is entirely client-side, and a
required-field check that keeps firing on a **hidden** input locks the applicant out of submitting
forever, with no in-UI recovery. A multi-agent review of the change surfaced four failure modes
worth designing against:

| Failure                    | How it would happen                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Applicant lockout**      | A question is hidden for Shipathon but its validation still requires it → the applicant can never clear the step or submit.                                          |
| **Normal-flow regression** | "Prior engagement always required" taken literally would newly force it on non-Shipathon "Yes" applicants, who never see that input.                                 |
| **Silent-off**             | The `is_shipathon` column isn't readable by the applicant role (grant/projection drift) → reads `undefined` → feature quietly does nothing.                          |
| **Silent revert on edit**  | The project edit form autosaves the whole row every 30s; if a seed path drops the flag, opening the edit page flips a Shipathon back to non-Shipathon with no error. |

## Decision

**One project-level boolean, one rule, consumed everywhere.**

1. **Schema.** Add `public.projects.is_shipathon boolean NOT NULL DEFAULT false`, mirroring
   `requires_interview` (migration `20260921120000`). Default `false` — Shipathon is the opt-in mode.
   The application flow reads the flag as the `authenticated` applicant via `projects.select('*')`;
   `authenticated` holds table-level SELECT on `projects` today (proven: the shipped application
   status page reads the grant-less `requires_interview` in production). We still add a
   **column-scoped** `GRANT SELECT (is_shipathon) ON public.projects TO authenticated` as a
   belt-and-suspenders against prod grant drift (migrations are hand-applied, no prod CI). Never a
   table-level grant — that would re-expose the four sensitive columns revoked in `20260513025458`.

2. **Single source of truth.** A pure module,
   `src/lib/applications/project-application-questions.ts`, exports
   `getProjectApplicationQuestions(project) → { askPreviousPhase, askClientKnowledge }` plus the
   `validateProjectStep2/3` required-field checks. The application page's **render, validation, and
   Step-4 review all derive from this one object.** Because validation is expressed as "required iff
   the question is asked," a hidden question is structurally incapable of being required — the
   lockout failure cannot occur by construction, not by remembering to add a guard.

3. **`=== true`, not `!flag`.** The flag is read as `is_shipathon === true`, so a missing/undefined
   column fails **safe** to the full, fully-reachable question set rather than silently hiding
   questions. `ProjectInfo.is_shipathon` is typed **optional** so the compiler keeps the undefined
   case visible.

4. **"Required iff rendered."** Step 2 renders the prior-engagement question via
   `askPreviousPhase && participatedPrev ? <previous-phase group> : <prior-engagement>`, and
   `validateProjectStep2` requires fields off the identical expression. This keeps the non-Shipathon
   flow **byte-for-byte unchanged** (Yes → previous-phase fields; No → prior engagement) and makes a
   stale `participatedPrev=true` draft harmless in Shipathon mode.

5. **Honest persistence.** `collectFields` writes `false`/`''` for questions that weren't asked, so a
   stored row never carries phantom answers to questions the applicant never saw. Safe regardless:
   all six affected columns are `NOT NULL DEFAULT ''`/`false`, so omission is legal.

6. **Toggle plumbing.** `is_shipathon` is added to the project form's schema, `EMPTY_FORM`, **both**
   edit-seed blocks, and a new `Switch` card next to the interview toggle — the exact
   `requires_interview` shape, so autosave round-trips it and cannot silently revert it.

**Scope: applicant form only.** Admin/read surfaces are deliberately left unchanged (see below).

## Alternatives considered

- **Inline `if (isShipathon)` guards in the page.** Rejected: puts a business rule in a view
  (boundary violation), and the render/validation/review copies drift apart — the exact source of
  the lockout risk.
- **A per-question configuration table / registry.** Rejected as over-engineering for two questions
  with no current requirement for admin-configurable question sets (YAGNI). Revisit if question sets
  ever need to vary per project beyond this flag.
- **Expose `is_shipathon` through the `public-project-detail` edge function.** Not needed: the
  application page reads `projects` directly as the authenticated user. Adding it there would create
  a second deploy surface (the edge-function pipeline) for no in-scope benefit.
- **Make the admin analytics / roster surfaces Shipathon-aware in this change.** Explicitly deferred
  (see Consequences).

## Consequences

**Positive**

- A Shipathon applicant can always submit; a hidden question can never be required. Proven by
  `src/test/lib/project-application-questions.test.ts` (pure unit tests of the spec + validators) and
  the pgTAP reachability test `supabase/tests/projects_is_shipathon_grant_test.sql`.
- The non-Shipathon application flow is unchanged.
- One place — the spec module — decides which questions apply; other surfaces can import it later.

**Negative / accepted**

- **Admin surfaces still assume the old question set** (deliberately out of scope). For a Shipathon
  project, the admin "recruitment readiness" analytic counts every applicant as "did not participate
  in a previous phase" (understating the score by up to ~15 pts), and the All-Applications roster/CSV
  shows "Previous Participant? = No" and blank cells for the removed questions. This is a
  correctness/interpretation issue, **not** a crash or lockout. Tracked as a follow-up
  (make `ProjectAnalysisContent` and `SubmittedApplicationsTab` read `is_shipathon`).
- The `public-project-detail` opening page shows no Shipathon-specific copy (no change requested).
- **Deploy ordering (apply migration FIRST):** the migration is **hand-applied to prod** via
  `supabase db push` (no prod CI), while the frontend auto-deploys on push to `main` (Cloudflare
  Pages). It must be applied **before** the frontend ships. Blast radius if it isn't: the project
  edit form autosaves the **whole row every 30s** (now including `is_shipathon`), so a frontend that
  ships ahead of the column makes **every** admin project create/edit — and every background autosave
  on any open edit page — fail with `PGRST204`, not just Shipathon toggles. (Applicant reads degrade
  safely to `undefined` → feature off.) This is the same class as the prior PGRST202/PGRST204
  hand-apply outages. Mitigation: apply `20260921120000` to prod and confirm the blocking
  `db-schema-gate` (ADR-0036) is green before merge/deploy.
- A pre-existing, out-of-scope finding surfaced during review: the column-level `REVOKE` in
  `20260513025458` is a no-op under the table-level grant model, so four "sensitive" `projects`
  columns may still be readable by `authenticated`. Filed separately; not addressed here.
