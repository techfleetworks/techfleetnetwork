# ADR 0061 — Cohort registration status (Coming Soon / Register Now / Live / Finished)

- Status: Accepted
- Date: 2026-09-26
- Deciders: Morgan Denner
- Epic: Classes / Cohorts

## Context

Classes and cohorts have a `status` column, but it is the **publish/approval workflow**:
`draft → pending_review → published → archived | cancelled`. It governs who may see and edit the
record and is guarded by a transition-validation trigger and workflow RPCs
(`submit_class_for_review`, `approve_and_publish_class`, `cancel_cohort`). This is the important
teacher/admin flow and must stay.

What was missing is a second, orthogonal axis: the **learner-facing registration lifecycle** — where
a cohort sits on its public timeline. A published cohort can be announced but not yet open (Coming
Soon), open for sign-ups (Register Now), running (Live), or done (Finished). `status` cannot express
this, and the two must not be conflated.

The two axes, and where each is owned:

- **Publish Status** — the existing approval workflow. Conceptually a **class-level** action: publishing
  a class publishes its cohorts (`approve_and_publish_class`). Cohorts also carry their own publish
  `status` (it gates the Submit action, edit permissions, and the Register button), which is surfaced
  per cohort as well.
- **Registration Status** — the new run lifecycle, set on the **cohort**.

Projects already model this run-lifecycle shape (`project_status` enum → "Coming Soon", "Project In
Progress"/Live, …, surfaced as `PROJECT_STATUSES` `{value,label}`), so there is an in-repo pattern to
match rather than invent.

Two constraints shaped the design:

1. **Settable after publication.** A cohort goes Live and then Finished _after_ it is published — but
   the table RLS policy "Teachers can edit their draft cohorts" limits owner `UPDATE` to
   `draft|pending_review`; once published only an admin can write the row directly. So the owner needs
   a write path that works post-publication without opening up the rest of the row.
2. **Manual, not derived.** Coming Soon vs Register Now is not derivable from `start_date`/`end_date`
   (there is no registration-open date), and the owner wants explicit control, so registration status
   is set by a human, not computed.

Registration itself (letting students actually sign up) is **not built and is explicitly out of
scope** here — a separate future ticket. This ADR adds only the registration-status field and the way
to set it.

## Decision

Introduce cohort registration status as a first-class field, distinct from the publish `status`.

- **Enum + column (expand-only, ADR-0026).** New `public.cohort_registration_status` enum
  (`coming_soon`, `register_now`, `live`, `finished`) and an additive
  `cohorts.registration_status cohort_registration_status NOT NULL DEFAULT 'coming_soon'`. The default
  backfills existing rows and covers still-running old inserts, so the migration is safe to apply
  before the UI ships and safe to leave applied if the UI rolls back. No column grant is needed —
  `cohorts` still holds table-level `SELECT` for `authenticated` (unlike `projects`, ADR-0056), so it
  is auto-readable on the existing cohort read paths.
- **Single write path: `set_cohort_registration_status(p_cohort_id, p_status)`.** A `SECURITY DEFINER`
  RPC that authorizes **owner-or-admin**
  (`owner_user_id = auth.uid() OR has_role(auth.uid(),'admin')`), updates **only**
  `registration_status`, works at any publish status, and records the change in `class_audit` —
  mirroring `submit_class_for_review` (owner check) and the admin RPCs. Granted to `authenticated`,
  never `anon`.
- **UI — both statuses shown, clearly labeled.** The class header labels its `status` as **"Publish
  Status."** Each cohort card shows **both**: its own **"Publish"** badge (Draft/Published, the
  workflow) and its **"Registration"** status — an inline dropdown for owners/admins
  (`CohortRegistrationStatusControl` → `useSetCohortRegistrationStatus` →
  `CohortService.setRegistrationStatus`), a read-only badge for everyone else. The `{value,label}` list
  lives in `src/lib/validators/cohort.ts` (`COHORT_REGISTRATION_STATUSES`), matching the
  `PROJECT_STATUSES` convention.

## Alternatives considered

- **Overload `status` with the four states.** Rejected: it conflates two orthogonal axes (approval vs
  registration timeline), collides with the transition trigger and workflow RPCs, and would break
  every existing reader of `status`. They are genuinely independent lifecycles.
- **Derive registration status from dates instead of storing it.** Rejected: Coming Soon vs Register
  Now cannot be derived without a registration-open date the model does not have, and the owner wants
  manual control. A stored, human-set field is the honest owner of this fact.
- **Widen the table `UPDATE` RLS policy so owners can edit published cohorts.** Rejected as a security
  regression: it would let owners edit _every_ column on a published cohort, not just
  `registration_status`. A column-scoped `SECURITY DEFINER` RPC is the least-privilege write path and
  matches how the codebase already does privileged, status-crossing cohort mutations.
- **Admin-only setter.** Rejected: a class owner owns their cohort's public timeline; requiring an
  admin to flip Live/Finished would not scale. The RPC allows owner-or-admin.
- **Show only Registration Status on cohorts (Publish Status at class level only).** Rejected by
  product: the per-cohort Draft/Published state is part of the teacher/admin flow and stays visible on
  the cohort card alongside Registration Status.

## Consequences

- Publish status and registration status are now separate, independently-settable axes, both visible
  and labeled. Non-registration behavior is unchanged — in particular the Register button still keys
  off `status === 'published'` today; wiring registration to `register_now` is the deliberate
  follow-up ticket.
- Registration status is manually curated and can therefore disagree with the calendar (e.g. left on
  "Live" after `end_date`). Accepted: owners/admins own it, and it is a display/marketing signal, not
  a correctness invariant. A future enhancement could suggest a status from the dates.
- **Apply-first ordering (ADR-0036).** The migration is hand-applied to prod via `supabase db push`;
  the `db-schema-gate` stays red until the new type/column/function exist in prod. The migration is
  additive and backward-compatible, so it is applied **before** the PR merges (and before the
  Cloudflare Pages frontend that reads it deploys). An older frontend simply ignores the new column.
- Authorization is proven at the DB (ADR-0024) by
  `supabase/tests/cohort_registration_status_test.sql` (owner-can-post-publication,
  other-teacher-cannot, admin-can, outsider-cannot, missing-cohort-raises, audit-row-written) plus
  column-shape assertions.
- Adding a future registration status is an expand (`ALTER TYPE ... ADD VALUE`) plus a line in
  `COHORT_REGISTRATION_STATUSES`; removing one is a contract in a later migration.
