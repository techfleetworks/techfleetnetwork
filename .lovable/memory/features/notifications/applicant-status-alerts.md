---
name: Applicant Status Change Alerts
description: Recruiting Center status changes always send an in-app notification and (when notify_announcements=true) a branded transactional email
type: feature
---

When an admin changes an applicant's status from the Recruiting Center
(`ApplicantStatusDropdown` → `notify-applicant-status` edge function),
the applicant ALWAYS receives an in-app notification, regardless of
preferences. They additionally receive a branded transactional email
when their `profiles.notify_announcements` is `true` (default).

Two email templates are used:
- `interview-invite` — only for `invited_to_interview` (requires the
  coordinator's `scheduling_url`).
- `applicant-status-change` — used for all other transitions
  (`pending_review`, `interview_scheduled`, `not_selected`,
  `active_participant`, `left_the_project`). The template surfaces the
  status label, project name (Client — Friendly Name), a tailored
  message, and a CTA back to `/applications` (or `/journey` for
  active participants).

Idempotency keys are scoped per-status (`applicant-status-{appId}-{status}-{ts}`)
so each transition can send once. Email rendering uses
`email_unsubscribe_tokens` which has a unique constraint on `email` —
the queue helper defensively orders + limits the lookup to tolerate
any legacy duplicate rows.
