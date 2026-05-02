---
name: Teacher Role + Classes & Cohorts
description: Teacher role workflow, class authoring, cohort registration, RLS rules and surfaces
type: feature
---

## Roles
- New `teacher` app_role; granted via two-step admin promotion (mirrors admin promotion). Revoke reassigns owned classes to first admin.
- `TeacherRoute` guard allows teacher OR admin; mirrors `AdminRoute` UX.

## Data model
- `classes` (owner_user_id, track basic_training|advanced_training, status draft|pending_review|published|archived, slug unique)
- `cohorts` (class_id, start_date, end_date, registration_url, capacity, status draft|pending_review|published|archived)
- `cohort_registrations` (user_id, cohort_id) — insert-only, captured on Register click
- `class_followers`, `class_audit` (immutable history of status transitions)

## RLS highlights
- Public can SELECT only `status='published'` classes and published cohorts of published classes.
- Teachers can INSERT/UPDATE only their own classes while status is draft|pending_review.
- Admins can update/delete anything.

## Surfaces
- `/teach/classes` (My Classes), `/teach/classes/new`, `/teach/classes/:id`, cohort form
- Admin: `/admin/classes`, two-step `/confirm-teacher` token page
- Member: `/training` with Basic/Advanced tabs; `/journey` "My Classes" tab via `MyRegisteredClassesTab`
- Universal Search includes "Classes" group (published only)

## Notifications
- On publish: notify followers + interest-matched members (default scope).

## BDD coverage
- Scenarios TEACH-001..003, CLASS-001..008, COHORT-001..003 in `bdd_scenarios`. All include UI + DB + Code expected results.
