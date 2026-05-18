## Goal

When an applicant is marked `active_participant`, ask them to sign the Community Contributor Terms before they start training. Track the signature on the application record. Surface unsigned state on the member's dashboard and on the admin roster, with a manual resend.

## Data model

Two new tables + two columns on `project_applications`.

### `community_agreement_versions`
- `id` uuid PK
- `version` text unique (e.g. `2026-05-18`)
- `title` text
- `body_html` text — sanitized full terms (mirrored from techfleet.org so the side panel renders instantly without CSP/CORS round-trips, and so we have an immutable record of what each person agreed to)
- `source_url` text — `https://techfleet.org/community-contributor-terms-and-conditions`
- `is_current` boolean (only one row true at a time, enforced by partial unique index)
- `created_at`, `updated_at`
- RLS: any authenticated user can SELECT the current version; only admins can INSERT/UPDATE.

### `community_agreement_signatures`
- `id` uuid PK
- `application_id` uuid FK → `project_applications(id)` ON DELETE CASCADE, **unique**
- `user_id` uuid
- `project_id` uuid
- `version_id` uuid FK → `community_agreement_versions(id)`
- `signed_at` timestamptz
- `ip_address` inet, `user_agent` text — captured by edge fn for legal traceability
- RLS: user can SELECT/INSERT own row; admins can SELECT all. No UPDATE/DELETE (append-only).

### Columns added to `project_applications` (denormalized for fast UI queries)
- `community_agreement_required_at` timestamptz — set when the trigger fires (i.e., status went to `active_participant`)
- `community_agreement_signed_at` timestamptz — mirrored from signature row by trigger

A `BEFORE UPDATE` trigger on `community_agreement_signatures` keeps the mirror in sync, and the existing `notify-applicant-status` fn sets `community_agreement_required_at = now()` when status transitions to `active_participant` (idempotent — only sets if null).

### Derived status (no extra column)
`agreement_status` is computed in the UI/RPC:
- `not_required` — `community_agreement_required_at IS NULL`
- `pending` — required but `community_agreement_signed_at IS NULL`
- `signed` — both set

## Workflow

### 1. Trigger on selection (automatic)
Extend `notify-applicant-status` so that when an admin moves an applicant to `active_participant`, the function (after current logic):
1. Sets `community_agreement_required_at = now()` on the application (if null).
2. Creates an in-app notification with title "Sign Community Agreement", body containing the exact required copy with project + client name interpolated, `link_url = /applications/<app_id>?agreement=open`.
3. Calls the new `send-community-agreement-trigger` flow for the email piece so logic stays in one place.

### 2. Manual resend (admin)
- New edge fn `send-community-agreement-trigger` (admin-only, JWT + `has_role(admin)`):
  - Input: `{ application_id }`
  - Loads project + client + applicant, checks `applicant_status === 'active_participant'` and not already signed (otherwise refuses with a clear message).
  - Always inserts an in-app `notifications` row.
  - Queues `community-agreement-request` transactional email **only if** `profiles.notify_training_opportunities = true` (closest existing opt-in for project workflow emails — see Open question below).
  - Logs to activity log + writes an `email_send_log` correlation.
- Recruiting Center roster row gets a "Resend agreement" button (admins only, visible only when `agreement_status = 'pending'`). Disabled with a tooltip when status is `signed` ("Already signed on Jan 15, 2026") or `not_required`.

### 3. Member-facing UI
- New `<CommunityAgreementSheet>` (shadcn `Sheet`, side panel, right-aligned, full-height, scrollable). Props: `applicationId`, `open`, `onOpenChange`.
  - Fetches current version body from `community_agreement_versions` (or cached via React Query).
  - Renders sanitized HTML with project + client name interpolated at top.
  - Sticky footer with a labeled checkbox "I have read and agree to the Community Contributor Terms" and a primary `Agree and continue` button (verb+object; disabled until checkbox ticked).
  - On submit calls RPC `sign_community_agreement(application_id, version_id)` which inserts the signature row server-side (records `inet_client_addr()`, request UA via header). Returns success or "already signed" idempotently.
  - Live-announces success via `LiveAnnouncer`. Closes the sheet on success and invalidates application queries.
- Three open points for the sheet, all wired through the same component:
  - **Notification card** — clicking the bell notification or the in-email "Review and agree" button deep-links to `/applications/<app_id>?agreement=open`; the page detects the query param and opens the sheet automatically.
  - **Project Application Status / Detail page** (`ProjectApplicationStatusPage` for members, plus the existing detail card on `/applications/:id`) — when `agreement_status = 'pending'`, render a prominent "Sign community agreement" callout with verb+object CTA that opens the sheet.
  - **Dashboard widget** — under the existing `my_project_apps` section, each application with `agreement_status = 'pending'` shows a status pill "Sign Community Agreement" (semantic warning color) and an inline `Sign now` button that opens the sheet directly on the dashboard.

### 4. Admin visibility
- `RosterProjectDetailPage` applicant table gets a new "Agreement" column:
  - Empty / "—" when not required.
  - Amber "Pending since {date}" when required and unsigned, with `Resend` button.
  - Green "Signed {date}" when signed; hovering shows the version + IP (admins only) via tooltip for audit.
- Same surfacing on `RosterApplicantDetailPage`.

## Email template

`supabase/functions/_shared/transactional-email-templates/community-agreement-request.tsx`:
- Subject: `Sign your Community Contributor Terms to start on {projectName}`
- Body: the exact message the user specified, with `{projectName}` + `{clientName}` interpolated.
- Primary button "Review and agree" linking to `https://techfleet.network/applications/{applicationId}?agreement=open`.
- Registered in `registry.ts`. Idempotency key: `community-agreement-{applicationId}-{requiredAtIso}` so a true resend gets a new key but accidental double-clicks are dedup'd.

## BDD scenarios (added to `bdd_scenarios`)

Each with tri-layer Then-clauses ([UI]/[DB]/[Code]). Prefix `CCA-` (Community Contributor Agreement).
- CCA-001 Admin moves applicant to active_participant → trigger fires
- CCA-002 Member receives bell notification with correct copy
- CCA-003 Member receives email only when `notify_training_opportunities = true`
- CCA-004 Side panel opens from notification deep-link
- CCA-005 Side panel opens from dashboard application card
- CCA-006 Side panel opens from project application status page
- CCA-007 Sign action records signature with version, IP, UA
- CCA-008 Already-signed sign attempt is idempotent (no duplicate row)
- CCA-009 Dashboard status pill switches from "Sign Community Agreement" to "Signed" after signing
- CCA-010 Admin sees Pending/Signed in roster with date
- CCA-011 Admin Resend button is disabled when already signed
- CCA-012 Admin Resend re-queues email + in-app notification respecting opt-in
- CCA-013 Non-admin cannot call `send-community-agreement-trigger`
- CCA-014 RLS prevents user A from inserting a signature for user B's application
- CCA-015 New current version invalidates nothing already signed (immutable record)

## Files

**New**
- `supabase/migrations/<ts>_community_agreement.sql` — two tables, RLS, trigger, `sign_community_agreement` RPC, columns on `project_applications`, seed of current version row.
- `supabase/functions/send-community-agreement-trigger/index.ts`
- `supabase/functions/_shared/transactional-email-templates/community-agreement-request.tsx`
- `src/components/agreements/CommunityAgreementSheet.tsx`
- `src/components/agreements/CommunityAgreementStatusBadge.tsx`
- `src/components/agreements/AgreementResendButton.tsx` (admin)
- `src/services/community-agreement.service.ts`
- `src/hooks/use-community-agreement.ts`

**Edited**
- `supabase/functions/notify-applicant-status/index.ts` — on `active_participant`, set `community_agreement_required_at`, send notification + invoke trigger.
- `supabase/functions/_shared/transactional-email-templates/registry.ts` — register new template.
- `src/pages/DashboardPage.tsx` — agreement pill + sheet opener in `my_project_apps`.
- `src/pages/ApplicationSubmissionDetailPage.tsx` / `ProjectApplicationStatusPage.tsx` — callout + sheet.
- `src/pages/RosterProjectDetailPage.tsx`, `RosterApplicantDetailPage.tsx` — Agreement column + Resend button.
- `src/App.tsx` — handle `?agreement=open` query param on relevant routes.

## Open question (one, please confirm before I build)

You said the in-app + email should both go **only if the person has opted in on their profile**. The existing opt-in toggles are `notify_announcements` and `notify_training_opportunities`. Two valid reads:

1. **Use existing opt-ins** — `notify_training_opportunities` gates the email, `notify_announcements` gates the in-app. **Risk:** a member who opted out gets selected, sees nothing, and the project blocks on them. They'd only discover the requirement by visiting their dashboard.
2. **Treat the agreement as an unsuppressable required workflow notification** — in-app always shows (it's blocking their participation); email respects the existing `notify_training_opportunities` opt-in. This matches how interview invites and password resets already work.

I recommend **option 2** (safer, no broken-workflow risk). If you prefer strict opt-in for both, say so and I'll build option 1.

No frontend, edge function, RLS, or schema work happens until you confirm.
