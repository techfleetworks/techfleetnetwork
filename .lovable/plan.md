## Goals (two things bundled)

### A. Permanent rule: BDD scenarios must include tri-layer expected results

Save a new memory file and add it to the Core memory index so every future plan, every `bdd_scenarios` row, and every smoke test follows it automatically.

**New file `mem://constraints/bdd-expected-results.md`:**

```markdown
---
name: BDD Expected Results
description: Every BDD scenario must include expected results for UI, database, and code/API layers
type: constraint
---

Every BDD scenario (proposed in plans, stored in `bdd_scenarios`, or written
in test files) MUST include explicit expected results across all three layers:

1. UI — exact visible state: component, label text, color/variant, icon,
   position, badge text, toast color/duration/position, focus ring, ARIA,
   timeline node states, button enabled/disabled, copy strings verbatim.
2. Database — exact row state: which table, which column, old → new value,
   related rows created or unchanged, RLS-permitted actor.
3. Code / API — exact runtime behavior: edge function HTTP status + response
   body shape, query keys invalidated, hooks/services called, idempotency
   keys, emails queued (template name) or NOT queued, side effects suppressed.

Why: vague Then-clauses ("status is updated", "user sees the change") hide
regressions. Explicit tri-layer assertions catch UI/DB/API drift before it
ships and double as living documentation.

How to apply:
- In plans, write Then-clauses for each of the 3 layers per scenario.
- In bdd_scenarios.gherkin rows, the same rule applies.
- In auto-generated smoke tests, assert all 3 layers where feasible.
- If a layer genuinely doesn't apply (pure visual scenario, no DB/API),
  state "No DB change" / "No network call" explicitly rather than omit.
```

**Update `mem://index.md` Core section** — add this one-liner near the existing BDD line so it's in context for every action:

```
- BDD scenarios MUST include expected results for UI + database + code/API layers (tri-layer Then-clauses). No vague "status is updated".
```

**Update `mem://index.md` Memories section** — append:

```
- [BDD Expected Results](mem://constraints/bdd-expected-results.md) — Every scenario asserts UI + DB + code/API layers explicitly
```

---

### B. Re-issue the Project Interview Toggle scenarios with full tri-layer Then-clauses

Same plan as before (DB column, form switch, dropdown filter, public copy swap, status-page timeline, edge-function guards) — only the BDD block is rewritten to satisfy the new rule.

```gherkin
Feature: Project interview toggle

  Scenario: PROJ-INT-01 — Admin sees the interview toggle on new project form
    Given I am an admin on /admin/clients/projects/new
    Then [UI] a Switch labeled "This project includes applicant interviews" renders ON (accent-blue), with helper text "Turn off if the coordinator selects teammates directly from applications without scheduling interviews." and a visible WCAG-compliant focus ring
    And [DB] no row is written until Save is clicked
    And [Code] the Zod schema includes requires_interview: boolean with default true; no network calls fire on mount

  Scenario: PROJ-INT-02 — Admin saves a project without interviews
    Given the interview Switch is OFF on a new-project form
    When I click "Save Project"
    Then [UI] an emerald top-center toast "Project saved" shows for 30s, I am routed to the project detail page, and a "Selection by application" badge (muted outline) appears in the header
    And [DB] one new row in projects has requires_interview = false; no rows in project_applications
    And [Code] supabase.from("projects").insert is called once with { requires_interview: false }; query key ["admin-projects"] is invalidated

  Scenario: PROJ-INT-03 — Toggling an existing interview project to no-interview
    Given a project has requires_interview = true and 2 project_applications rows with applicant_status = 'invited_to_interview'
    When I edit the project, turn the Switch OFF, and click Save
    Then [UI] before save, a yellow inline warning appears below the Switch: "2 applicants are mid-interview. Their flow will continue; the change applies to new applicants only."; after save, an emerald toast "Project updated" shows
    And [DB] projects.requires_interview = false; the 2 project_applications rows are unchanged (applicant_status still 'invited_to_interview')
    And [Code] supabase.from("projects").update({ requires_interview: false }) called once; no calls to mark-interview-scheduled or notify-applicant-status

  Scenario: PROJ-INT-04 — Public opening detail (interview project)
    Given a published project with requires_interview = true
    When I view its public opening detail page
    Then [UI] a section heading "Interview Process" renders, the header badge reads "Interview required" (primary-blue outline), timeline bullet #1 reads "…interview and choose teammates…", and no "Selection Process" section exists
    And [DB] no writes
    And [Code] only the existing public project read query fires

  Scenario: PROJ-INT-05 — Public opening detail (no-interview project)
    Given a published project with requires_interview = false
    When I view its public opening detail page
    Then [UI] the "Interview Process" section is replaced by "Selection Process" containing verbatim copy: "This project does not include interviews. The project coordinator will review applications and select teammates directly. You'll be notified by email and on your application status page when a decision is made."; header badge reads "Selection by application" (muted outline); timeline bullet #1 reads "…review applications and choose teammates…"; considerations bullet #2 reads "Not everyone who applies will be selected, or contacted individually…"; no "calendly" or "schedule" substring is present anywhere on the page
    And [DB] no writes
    And [Code] no scheduling-related fetches fire

  Scenario: PROJ-INT-06 — Status page for no-interview applicant
    Given a project_applications row with project.requires_interview = false and applicant_status = 'pending_review'
    When I view my application status page
    Then [UI] the timeline renders 3 nodes left-to-right: "Submitted" (emerald check), "Under Review" (active pulsing), "Active Teammate" (outline); no "Mark interview as scheduled" button is in the DOM; no "Schedule your interview" copy block exists
    And [DB] no writes
    And [Code] no edge-function calls fire on render

  Scenario: PROJ-INT-07 — Status page for interview applicant (regression)
    Given a project_applications row with project.requires_interview = true and applicant_status = 'invited_to_interview'
    Then [UI] timeline renders "Submitted" (✓), "Invited for Interview" (active), "Active Teammate" (outline); a primary-blue "Mark interview as scheduled" button is enabled
    And [DB] no writes on render
    And [Code] no edge-function calls fire on render

  Scenario: PROJ-INT-08 — No-interview applicant promoted to Active
    Given my project_applications row has applicant_status = 'pending_review' on a project with requires_interview = false
    When the admin sets my status to "active_participant"
    Then [UI] my status page Active Teammate node renders filled emerald with Trophy icon; a top-center emerald toast "[Name] is now an Active Participant!" shows; my email contains NO "calendly", "schedule", or scheduling-link substring
    And [DB] project_applications.applicant_status = 'active_participant'; one row inserted in notifications (title "You've joined the team"); one row inserted in notification_outbox using template "applicant-status-change" (NOT "interview-invite"); discord_role_grant_queue may have a new row if Discord is connected
    And [Code] notify-applicant-status invoked once with newStatus='active_participant'; idempotency key applicant-status-{id}-active_participant-{ts}; no invocation of mark-interview-scheduled

  Scenario: PROJ-INT-09 — Status dropdown hides interview options
    Given an admin viewing the roster of a project with requires_interview = false
    When I open an applicant's status dropdown
    Then [UI] the menu (w-52) lists exactly 4 items in this order: "Pending Review", "Not Selected" (UserX icon), "Active Participant" (Users icon), "Left the Project" (LogOut icon); "Invite to Interview" and "Interview Scheduled" are NOT in the DOM
    And [DB] no writes on open
    And [Code] component receives prop requiresInterview={false}; SELECTABLE_STATUSES is filtered before render

  Scenario: PROJ-INT-10 — Status dropdown shows interview options (regression)
    Given an admin viewing the roster of a project with requires_interview = true
    Then [UI] the menu lists 6 items including "Invite to Interview" and "Interview Scheduled" (both Calendar icons)
    And [DB] no writes
    And [Code] requiresInterview={true} prop; full SELECTABLE_STATUSES list rendered

  Scenario: PROJ-INT-11 — mark-interview-scheduled rejects no-interview projects
    Given a project has requires_interview = false
    When any client POSTs to mark-interview-scheduled for that project
    Then [UI] if triggered from the UI, a red top-center toast "This project does not require interviews" shows for 30s
    And [DB] project_applications row is unchanged; no notifications row inserted; no notification_outbox row inserted
    And [Code] the edge function returns HTTP 400 with body { error: "Project does not require interviews" }; no email queued

  Scenario: PROJ-INT-12 — notify-applicant-status rejects interview statuses on no-interview projects
    Given a project has requires_interview = false
    When any client invokes notify-applicant-status with newStatus in ('invited_to_interview', 'interview_scheduled')
    Then [UI] if triggered from the UI, a red top-center toast "Interview statuses are disabled for this project" shows for 30s
    And [DB] project_applications.applicant_status is unchanged; no rows in notifications, notification_outbox, or email_send_log for this transition
    And [Code] the edge function returns HTTP 400 with body { error: "Interview statuses are disabled for this project" }; no Resend send call is made; no Discord webhook fires
```

---

## What I'll execute on approval

1. Write `mem://constraints/bdd-expected-results.md` and update `mem://index.md` (Core + Memories).
2. Implement the interview-toggle migration + 7 frontend files + 2 edge-function guards from the prior plan.
3. Insert all 12 scenarios above into `bdd_scenarios` with `feature_area = "Project Interview Toggle"`.
4. Generate the smoke test file via `scripts/generate-smoke-tests.ts`.

Approve to proceed.