# ADR 0067 — Unify "Classes" + "My Classes" into one role-aware "Class Admin" (Classes + Cohorts tabs)

- Status: Accepted
- Date: 2026-09-26
- Deciders: Morgan Denner
- Epic: Classes / Cohorts

## Context

Class management was split across two navigation entries that confused teachers and admins:

- Admin **"All Classes"** at `/admin/classes` (guarded by `AdminRoute` — admin role + authenticator
  2FA), the review/approval queue over every class.
- Teacher **"My Classes"** at `/teach/classes` (guarded by `TeacherRoute` — teacher or admin), the
  author's own classes.

The two list pages (`AdminClassesPage`, `MyClassesPage`) were ~90% copy-pasted (status pills, AG-Grid
column defs, filter tablist, page shell) — a second way to do the same thing. Cohorts had **no
management surface of their own**: they were reachable only by drilling into a single class
(`ClassDetailPage` → its Cohorts tab → the class-scoped `CohortFormPage`). And teachers could not
delete a cohort at all — the only cohort DELETE policy was admin-only, with a separate admin `cancel`.

Separately, ADR-0061 (#387) had just introduced the cohort **registration status**
(`cohorts.registration_status`: coming_soon → register_now → live → finished), a second, orthogonal
status axis to the publish/approval status (`classes.status` / `cohorts.status`).

## Decision

Collapse everything into **one role-aware section, "Class Admin"**, under a single navigation entry
and a single route namespace `/class-admin/*`, guarded by a new `ClassAdminRoute`.

- **One nav entry** ("Class Admin", Teaching group) shown to teachers **and** admins; members never see
  it. The admin-only pending-review badge (`count_classes_pending_review`) moves onto it.
- **Two tabs, each a real route** (deep-linkable): `/class-admin/classes` (default) and
  `/class-admin/cohorts`. Class detail and the class/cohort forms move under the namespace too;
  `<Navigate replace>` redirects every legacy path (`/teach/classes[/...]`, `/admin/classes`),
  preserving bookmarks and the confirm-teacher email link.
- **One shared `ClassList`** (`mode="admin" | "mine"`) replaces the two duplicated list pages, chosen
  by role. The bare "Status" column is renamed **"Publish status"** to disambiguate it from the new
  registration status. `AdminClassesPage` and `MyClassesPage` are deleted.
- **A standalone `CohortList`** (the Cohorts tab): a cross-class table scoped by RLS
  (`CohortService.listForScope()` — teacher sees their own, admin sees all), showing each cohort's
  **Registration status** (read-only, sourced from ADR-0061's `COHORT_REGISTRATION_STATUSES`) with the
  parent class's Publish status as context. Row actions match the Classes table: **Edit** (the existing
  cohort form) and **Delete**. "Add cohort" opens a class picker → the existing create form (no second
  create path). Registration status is _changed_ only via ADR-0061's owner/admin control on the class
  detail card (the single writer); it is display-only here.
- **Teacher-delete-own-cohort** via one new `delete_cohort(p_cohort_id)` SECURITY DEFINER RPC —
  owner-or-admin, the single delete path for both roles, mirroring `set_cohort_registration_status`
  (ADR-0061) and the other cohort mutation RPCs. It hard-deletes an empty, unpublished cohort but
  **soft-cancels** (status → `cancelled`) one that has registrations or is published, so the
  `cohort_registrations` history (ON DELETE CASCADE) is never silently dropped. It writes `class_audit`.
- **Role-aware 2FA** in `ClassAdminRoute`, composed from existing exports (`useMfaGate`, the admin
  grace RPCs, the shared `MfaChallengeDialog`) with **no change to the frozen auth layer**:
  - **admin** → 2FA mandatory: enrolled + AAL2 to enter; enrolled but below AAL2 → hard block +
    challenge; not enrolled → the same grace/setup path `AdminRoute` uses.
  - **teacher** → 2FA conditional: required only if that teacher has a verified authenticator
    (`hasVerifiedTotp`); if not enrolled, allowed through as before.
  - **member** → `/access-denied`.
    As defense-in-depth for the one destructive path, `delete_cohort` additionally requires `aal2` for
    **admin callers** (via `_current_aal()`); non-admin owners are exempt, preserving teacher-optional 2FA.

## Alternatives considered

- **Widen the cohort table DELETE policy to owners.** Rejected: RLS can't express the safety rule
  (count child registrations, fall back to soft-cancel), and a broad owner DELETE would also expose
  every-column writes we don't want. A column/behavior-scoped RPC is least-privilege — the same reason
  ADR-0061 used an RPC for registration status.
- **Keep admin's list behind `AdminRoute`'s 2FA and only merge teacher's.** Rejected: a single entry
  both roles reach can't be behind admin-only 2FA. Instead the guard makes 2FA mandatory for admins and
  conditional for teachers, matching the product intent, and keeps the server-side authorization
  (RLS + RPCs) as the durable guarantee.
- **Query `?tab=` instead of routed tabs.** Rejected in favor of real routes under the namespace — the
  product owner chose the full `/class-admin/*` restructure; routed tabs are deep-linkable and match the
  detail/form routes living under the same prefix.
- **Show registration count / an inline registration-status control in the Cohorts table.** Deferred:
  an accurate cross-user registration count needs a definer function (RLS scopes `cohort_registrations`
  to the viewer's own rows), and the product owner asked for Edit + Delete only — no inline control.

## Consequences

- Teachers and admins have one place to manage classes and cohorts; the duplicated list code is gone
  (one `ClassList`). Cohorts are manageable across classes for the first time.
- Frontend deploys via Cloudflare Pages on merge. The `delete_cohort` migration is **hand-applied to
  prod via the Supabase SQL Editor before merge** (prod has no migrations ledger); `db-schema-gate`
  stays red until it is applied, then the failed job is re-run. It is additive/expand-only (ADR-0026):
  safe before the UI ships and safe to leave if the UI rolls back.
- 2FA on these pages is enforced in the UI (as route 2FA is elsewhere in this app); the durable
  server-side guarantees remain authorization (RLS + the owner/admin RPCs) plus the admin `aal2` check
  inside `delete_cohort`. The teacher-conditional rule is intentionally a client policy — the DB cannot
  see a teacher's 2FA preference without breaking non-2FA teachers on a shared RPC.
- Built on top of ADR-0061 (registration status). Publish status (class-level) and registration status
  (cohort-level) stay two separate axes; this change only surfaces and labels them, never conflates them.
