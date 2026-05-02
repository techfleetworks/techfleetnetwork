
# Teacher Role + Classes & Cohorts — Requirements & System Audit

This is a **report only** (no code changes). It captures full requirements, the new data model, every surface to add or change, and the BDD plan. Approve to switch to build mode.

---

## 1. Use Case Requirements (Full)

### UC-1 — Admin promotes a user to Teacher
- Admin opens **User Admin** → finds user → "Promote to Teacher".
- Two-step confirmation (matches existing admin promotion pattern): admin issues promotion → user receives email + in-app notification → user clicks **Confirm Teacher Role** → role granted.
- Admin can **revoke** Teacher role at any time. Revoke does NOT delete the teacher's classes; classes become **owner-orphaned** and auto-reassigned to "Tech Fleet" (admin) until reassigned.
- Self-promotion blocked. Audit-logged with hash chain (existing `audit_log`).

### UC-2 — Teacher creates an Advanced (or Basic) class
- Teachers see a new **"My Classes"** page at `/my-classes` (sidebar item visible only to teachers + admins).
- "Create Class" button opens `ClassFormPage` — Zod-validated form with the full Class field set (see §3).
- Teacher chooses **Track**: `basic_training` or `advanced_training` (radio). This drives which tab the class appears under in `/courses`.
- New class is created with `status = draft`, `owner_user_id = teacher`. Drafts are hidden from members.

### UC-3 — Draft vs Published vs Archived (visibility rules)
- `class_status` enum: `draft`, `pending_review`, `published`, `archived`.
- **Draft / pending_review / archived** classes are **never** visible on the member-facing `/courses` page or universal search.
- Teachers see their own classes in all states on `/my-classes`.
- Admins see all classes in all states on a new admin **Classes Console** at `/admin/classes` (Card view default, Table toggle).
- Cohorts have their own `cohort_status` enum: `draft`, `open`, `live`, `completed`, `cancelled`. Only `open` / `live` cohorts show registration UI to members.

### UC-4 — Custom classes appear under "Basic Training" or "Advanced Training"
- The existing `/courses` tabs **"Beginner Courses"** → renamed to **"Basic Training"**, **"Advanced Courses"** → renamed to **"Advanced Training"**.
- Each tab queries `classes` where `status = 'published'` AND `track = <tab>` and renders them as `CourseCard`s alongside any future hard-coded entries.
- Card shows: class name, summary, total weeks, # published cohorts (next start date), follower count, and "View class".

### UC-5 — Teacher controls Basic vs Advanced
- Track is a teacher-editable field on the Class form (until first publish; after first publish track is locked to prevent confusing learners — admin can override).

### UC-6 — Admin approves & publishes
- Teacher clicks **Submit for Review** → `status` flips to `pending_review`. Notification fanout to all admins.
- Admin reviews on `/admin/classes` → **Approve & Publish** (status → `published`) or **Request Changes** (status → `draft` with a comment stored in `class_review_notes`).
- Teachers **cannot** publish themselves. The `transition_class_status` SQL function enforces this (security definer, checks `has_role(auth.uid(),'admin')`).
- On publish: notify the teacher, notify all followers of the class (zero on first publish), and any users whose stored `professional_goals` / `interests` / `experience_areas` overlap with class skills (reuses existing training-opportunity-alerts pipeline).

### UC-7 — Archiving a class
- Admin OR class owner can archive (status → `archived`). Archiving:
  - Hides class from `/courses` and search.
  - Cancels all `open` cohorts (status → `cancelled`), notifies registered members.
  - Keeps historical registrations + completion records intact.
- Unarchive returns class to `draft` (must re-submit for review).

### UC-8 — Teacher creates multiple cohorts; members register
- On a published class, teacher can create N `cohorts` (status starts `draft`). Cohort fields: name (e.g., "Spring 2026"), start_date, end_date, registration_link (URL — Gumroad/Eventbrite/etc.), capacity (nullable), price_cents (nullable), notes.
- Teacher flips cohort to `open` to make registration visible. Admin approval **not** required for cohorts on an already-published class (assumption — see Open Question O1).
- Members on the class detail page see all `open` and `live` cohorts. Clicking **Register** opens the external registration link in a new tab AND creates a `cohort_registrations` row (`user_id`, `cohort_id`, `registered_at`, `source='self'`).

### UC-9 — "My Registered Classes"
- New section on `/my-journey` (or new tab) called **"My Classes"** showing every cohort the user is registered for with: class name, cohort name, start/end dates, status badge (Upcoming / Live / Completed / Cancelled), and a link to the class.
- Dashboard widget (optional — added to existing dashboard preferences).

### UC-10 — Admin Classes Console (all states)
- `/admin/classes` lists ALL classes & cohorts with filters: status, track, owner, has-open-cohorts. AG-Grid table view + Card view toggle. Per-row actions: View, Edit, Approve, Publish, Archive, Reassign owner, Delete (soft).

### UC-11 — WYSIWYG syllabus
- All long-form rich-text fields use the existing `RichTextEditor` (react-quill-new), with sanitized rendering via `SafeMarkdown`/DOMPurify on read. Toolbar already supports headings, lists, bold/italic/underline, blockquote, links.

---

## 2. Promotion + Class Lifecycle Flow

```text
Admin → Promote(User) ──► admin_promotions(role='teacher') ──► email/notif
   User → /confirm-teacher → user_roles += 'teacher'
Teacher → Create Class (status=draft)
Teacher → Edit Syllabus / fields
Teacher → Submit for Review (status=pending_review)  ──► notify admins
Admin → Approve & Publish (status=published)         ──► notify teacher + matched members
Teacher → Add Cohorts (status=draft → open)          ──► visible on class page
Member → Register → external link + cohort_registrations row
Admin/Teacher → Archive (status=archived)            ──► cancel open cohorts
```

---

## 3. Data Model (new)

### Enums
- `app_role` extended: add `'teacher'`.
- `class_track`: `basic_training` | `advanced_training`.
- `class_status`: `draft` | `pending_review` | `published` | `archived`.
- `cohort_status`: `draft` | `open` | `live` | `completed` | `cancelled`.

### Table `public.classes`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| owner_user_id | uuid NOT NULL | references auth.users(id) (no FK; pattern across project) |
| name | text NOT NULL | class name (≤120 chars) |
| slug | text UNIQUE | auto from name |
| track | class_track NOT NULL | basic / advanced |
| status | class_status NOT NULL DEFAULT 'draft' | |
| timeframe_weeks | int NOT NULL CHECK (1-52) | |
| summary | text NOT NULL | plain text ≤500 |
| why_take_html | text NOT NULL | sanitized HTML |
| learning_outcomes_html | text NOT NULL | |
| audiences_html | text NOT NULL | |
| skills | text[] | from skills.csv |
| deliverables | text[] | from deliverables.csv |
| workshop_template_ids | uuid[] | FKs to workshops |
| curriculum_html | text NOT NULL | |
| homework_html | text NOT NULL | |
| registration_link | text | URL validated |
| cover_image_url | text | optional |
| review_notes | text | admin feedback on rejection |
| published_at | timestamptz | |
| archived_at | timestamptz | |
| created_at / updated_at | timestamptz | |

### Table `public.cohorts`
- id, class_id (FK classes), name, status (cohort_status), start_date, end_date, registration_link, capacity int null, price_cents int null, notes_html, created_at/updated_at.
- Validation trigger: `end_date >= start_date`; `start_date >= today` when transitioning draft→open.

### Table `public.cohort_registrations`
- id, cohort_id, user_id, registered_at, source ('self'|'admin'), unique(cohort_id, user_id).

### Table `public.class_followers`
- id, class_id, user_id, followed_at, unique(class_id,user_id). Used for "follow for updates".

### Table `public.class_review_history`
- id, class_id, actor_user_id, from_status, to_status, comment, created_at. Append-only.

### RLS (key policies)
- `classes`: SELECT to `authenticated` when `status='published'`; SELECT to owner always; SELECT to admins always; INSERT only if `has_role(auth.uid(),'teacher') OR has_role(auth.uid(),'admin')` and `owner_user_id = auth.uid()` (admins can set any owner); UPDATE only by owner (when status in draft/pending_review) or admins; DELETE admins only (soft delete via archive preferred).
- `cohorts`: same owner/admin write rules; SELECT public when parent class published AND cohort status in (open, live, completed); SELECT owner/admin always.
- `cohort_registrations`: user can SELECT/INSERT/DELETE own; admin SELECT all; teacher SELECT registrations for their own cohorts.
- `class_followers`: user manages own; teachers/admins SELECT for own/all classes.
- `class_review_history`: SELECT owner+admins; INSERT via SQL function only.

### Status transition guards
- Security-definer functions: `submit_class_for_review(uuid)`, `publish_class(uuid)`, `request_changes(uuid, text)`, `archive_class(uuid)`, `unarchive_class(uuid)`. Each enforces role + valid source state and writes to `class_review_history`.

---

## 4. Surface Audit — every file added or changed

### Routes / pages (new)
- `src/pages/MyClassesPage.tsx` — teacher's class list (`/my-classes`).
- `src/pages/ClassFormPage.tsx` — create/edit class (`/my-classes/new`, `/my-classes/:id/edit`).
- `src/pages/ClassDetailPage.tsx` — public-facing detail (`/classes/:slug`) with cohorts + Follow + Register.
- `src/pages/CohortFormPage.tsx` — create/edit cohort (`/my-classes/:id/cohorts/new`, `.../cohorts/:cohortId/edit`).
- `src/pages/admin/AdminClassesPage.tsx` — admin console (`/admin/classes`).
- `src/pages/ConfirmTeacherPage.tsx` — mirror of `ConfirmAdminPage` for teacher confirmation (`/confirm-teacher`).

### Routes / pages (changed)
- `src/App.tsx` — register the 6 new routes; gate `/my-classes/*` behind `TeacherRoute`, `/admin/classes` behind `AdminRoute`.
- `src/pages/TrainingPage.tsx` — rename tabs "Beginner Courses" → "Basic Training" and "Advanced Courses" → "Advanced Training"; load published classes from DB into `beginnerCourses` / `advancedCourses` via new hook.
- `src/pages/UserAdminPage.tsx` — add "Promote to Teacher" action in `UserActionsDropdown` and badge for teacher role; add "Revoke Teacher" action.
- `src/pages/MyJourneyPage.tsx` — add "My Classes" tab/section showing registered cohorts.
- `src/pages/DashboardPage.tsx` + `dashboard_preferences` default — add new optional widget `my_classes`.
- `src/components/UniversalSearch.tsx` — index `classes` (published only) and `cohorts` (open/live).
- Sidebar nav (wherever items are configured) — add "My Classes" (teachers/admins) and "Classes" under Admin (admins).

### Components (new)
- `src/components/admin/TeacherRoute.tsx` — route guard.
- `src/components/classes/ClassCard.tsx` — card used on `/courses`, admin console, search, dashboard.
- `src/components/classes/CohortList.tsx` + `CohortCard.tsx`.
- `src/components/classes/ClassStatusBadge.tsx` and `CohortStatusBadge.tsx`.
- `src/components/classes/ClassReviewPanel.tsx` — admin approve/request-changes UI.
- `src/components/classes/FollowClassButton.tsx`.
- `src/components/classes/RegisterCohortButton.tsx`.

### Hooks (new)
- `src/hooks/use-classes.ts` — list, byId, byTrack (published).
- `src/hooks/use-my-classes.ts` — owned classes (teacher view).
- `src/hooks/use-class-cohorts.ts`.
- `src/hooks/use-cohort-registrations.ts` (current user's registrations).
- `src/hooks/use-class-followers.ts`.
- `src/hooks/use-teacher.ts` — mirror of `use-admin.ts`.

### Services (new)
- `src/services/class.service.ts` — CRUD + transition wrappers calling the security-definer SQL functions.
- `src/services/cohort.service.ts`.

### Validation (new)
- `src/lib/validators/class.ts` — Zod schema (name 1-120, summary 1-500, all *_html non-empty after stripping, weeks 1-52, registration_link valid URL).
- `src/lib/validators/cohort.ts`.

### Reference data exposure
- New hook `src/hooks/use-skills-reference.ts` and `use-deliverables-reference.ts` reading the existing CSVs in `public/data/` (already shipped). MultiSelect options sourced from these.
- Workshops already in DB — reuse `fetchWorkshops()` from `src/data/workshops.ts`.

### Edge functions (new)
- `supabase/functions/notify-class-published/index.ts` — fanout to followers + interest-matched members (reuses `notification_fanout_jobs`).
- `supabase/functions/notify-cohort-opened/index.ts` — fanout to followers when a new cohort flips to `open`.
- `supabase/functions/promote-to-teacher/index.ts` — mirror of `promote-to-admin` (issues confirmation token, sends email).
- `supabase/functions/confirm-teacher-role/index.ts` — mirror of `confirm-admin-role`.

### Migrations
- One migration adds the 4 enums, 5 tables, RLS policies, transition functions, validation triggers, and updates `app_role` enum to include `'teacher'`. Plus seed of `transition_class_status` review-history insert helper.

### Memory updates
- `mem://features/classes-and-cohorts.md` — full feature spec.
- `mem://features/teacher-role.md` — role lifecycle + revocation behaviour.
- Update `mem://index.md` core: "Teachers can author classes; only admins publish; drafts hidden from members."

---

## 5. BDD Scenarios (24 — to be inserted into `bdd_scenarios`)

Feature areas: `Teacher Role` (TR-01..05), `Class Authoring` (CA-01..06), `Class Publishing` (CP-01..04), `Cohorts` (CO-01..05), `Member Registration` (MR-01..04). Every scenario has UI + DB + Code/API expected results (per workspace BDD rule).

Examples:
- **TR-01** Admin promotes member to teacher → user_roles row created after confirm; teacher sees /my-classes link; audit_log entry written.
- **CP-02** Teacher cannot self-publish → publish_class RPC returns 42501; UI hides Publish button; status unchanged in DB.
- **CO-03** Archiving a class cancels open cohorts → cohorts.status='cancelled' for affected rows; registrants receive notification rows; UI shows "Cancelled" badge.
- **MR-01** Member registers for an open cohort → cohort_registrations row exists; My Classes lists it; external link opened in new tab.

---

## 6. Open questions (please confirm before build)

1. **O1 — Cohort approval:** does adding a *new* cohort to an already-published class require admin re-approval? Default in plan: **no** (teacher can self-publish cohorts). Confirm or flip.
2. **O2 — Registration:** is registration purely an external link (Gumroad/Eventbrite) with us recording the click, or do we also collect payment in-app? Default: **external link + click record**.
3. **O3 — Track lock-in:** should `track` (basic/advanced) be locked after first publish? Default: **yes**, admin override only.
4. **O4 — Teacher revocation:** when teacher role is revoked, reassign their classes to: (a) a designated admin, (b) keep on the now-non-teacher user as read-only, (c) auto-archive. Default: **(a)** reassign to first admin; admin can re-reassign.
5. **O5 — Notifications scope on publish:** notify (a) followers only, (b) followers + interest-matched, (c) all members. Default: **(b)**.

Approve as-is (with the defaults above) or tell me which open questions to change, and I'll switch to build mode and implement everything end-to-end.
