## Why "Submit" errors out today

The Postgres RPCs `submit_class_for_review`, `approve_and_publish_class`, `request_class_changes`, `archive_class` all take **`p_class_id` / `p_reason` / `p_cohort_ids`**, but `src/services/class.service.ts` calls them with **`_class_id` / `_reason`**. PostgREST resolves RPCs by named arguments, so it returns "Could not find the function … in the schema cache" → toast: "Action failed". Same bug class affects Approve, Request Changes, and Archive.

We'll fix the bug *and* design the missing UX around it, since today there's no real "approve / deny" surface, no teacher-visible status feedback beyond a pill badge, and no notifications.

---

## Status model (no schema change needed)

Reuse the existing enum: `draft → pending_review → published`, plus `archived`. "Denied" is modeled as `pending_review → draft` with a reason recorded in `class_audit` (so the teacher edits and resubmits — no dead-end status). This matches how `request_class_changes` already works.

```text
        ┌───────── teacher edits ─────────┐
        ▼                                 │
     draft  ──submit──▶  pending_review  ─┴─ deny (reason) ──▶ draft
                              │
                              └─ approve ──▶ published ──▶ archive ──▶ archived
                                              ▲
                              archive ────────┘
```

---

## User experience

### 1. Teacher submitting a draft for approval

On `ClassDetailPage` for a `draft` they own:
- Primary action becomes **"Submit for review"** in a sticky action bar.
- Click → confirm dialog: "Once submitted, an admin will review your class. You can keep editing while it's pending." → Confirm.
- Pre-submit checklist blocks the dialog if required fields (title/summary/track/outcomes) are missing — error prevention before the round-trip.
- Success: 30s emerald top-center toast "Submitted for review", status pill flips to **Pending review** (amber), audit row written.

### 2. Admin seeing all drafts sent for approval — **AG Grid queue**

`AdminClassesPage` rebuilt around an **AG Grid** (`gridId="admin-classes"`) with:
- Quick-filter chips above the grid: **Pending review (N)** · Drafts · Published · Archived · All — these set a server-side AG Grid filter on the `status` column and persist via the existing `useGridState` hook.
- Default load = **Pending review** tab open with a count badge that also lights up the sidebar nav item.
- Columns: Title (link cell → detail page), Owner (avatar + name), Track, Status (color-pill cell renderer), Submitted (relative + sortable raw timestamp), Updated, Cohort count, Actions (Review / Approve / Request changes / Archive — context-aware to row status).
- Row click opens detail page; action buttons stop propagation. Approve / Request Changes / Archive open the same modals used on the detail page so admins can clear the queue without navigating.
- Built-in toolbar: Reset View, Export CSV, Columns picker (free from the `ThemedAgGrid` wrapper).
- Copy-on-click is **disabled** for this grid (`disableCellCopy`) since cells are interactive.

### 3. Admin approving a single class

On `ClassDetailPage` while admin and `pending_review`:
- Sticky action bar shows **Approve & publish** (primary) and **Request changes** (outline).
- Approve → confirm dialog summarizing what will happen ("Publishes the class, makes it visible in Basic/Advanced Training, and any pending cohorts go live too.") → Confirm.
- Success toast, status pill → **Published** green, `published_at` set, teacher receives in-app notification + email.

### 4. Admin denying ("request changes")

- Modal with required `reason` textarea (min 20 chars, max 2000, sanitized) + canned-reason quick-pick chips ("Outcomes need clarifying", "Summary too short", "Missing prerequisites").
- Confirm → status returns to `draft`, reason stored in `class_audit.reason`, teacher receives in-app notification + email containing the reason and a deep link back to the edit page.
- Reason shown to the teacher on `ClassDetailPage` as a dismissible warning banner and on `MyClassesPage` rows as a "Changes requested" chip.

### 5. Teachers seeing status of their classes — **AG Grid**

`MyClassesPage` rebuilt around an **AG Grid** (`gridId="my-classes"`) with:
- Quick-filter chips: **Needs your attention** (drafts + changes-requested) · Pending review · Published · Archived · All — default tab = whichever needs attention.
- Columns: Title (link), Track, Status (color pill), Last update, Submitted, Published, Cohorts, Actions (Edit / Submit-for-review when applicable).
- A **"Changes requested"** amber chip with hover/expand showing the latest admin reason inline.
- Empty state preserved (CTA to create first class) and shown when grid has zero rows after filtering.
- Same toolbar perks: Reset View, Export CSV, Columns picker, persisted per-user view.
- Mobile: AG Grid horizontal scroll already handled by the wrapper; chips wrap; status legend tooltip stays for recognition over recall.

---

## Business logic

| Transition | Who | Preconditions | Side effects |
|---|---|---|---|
| `draft → pending_review` | Class owner | All required fields present; class is `draft` | Set `submitted_at = now()`, audit row, optional cohort co-submission, notify all admins (in-app + email, batched). |
| `pending_review → published` | Admin | Class is `pending_review` | Set `published_at = now()`; co-publish cohorts in `pending_review`; audit row; notify owner; Discord webhook to `#new-classes`. |
| `pending_review → draft` (deny) | Admin | Class is `pending_review`; reason ≥ 20 chars | Audit row with reason; notify owner with reason; cohorts untouched. |
| `* → archived` | Admin (anytime) | Not already `archived` | Cascade-archive non-cancelled cohorts; audit row; notify owner; class hidden from public Training pages. |

All transitions stay inside the existing SECURITY DEFINER RPCs, but the client must call them with the correct argument names.

---

## Security

- **Fix RPC arg names** in `class.service.ts` (`p_class_id`, `p_cohort_ids`, `p_reason`). Same audit on `cohort.service.ts`. This alone unblocks every action.
- Keep SECURITY DEFINER functions as the only write path; teachers and admins never UPDATE `classes.status` directly.
- **Server-side authorization** (already present, keep): `submit_class_for_review` checks `auth.uid() = owner_user_id`; admin functions check `has_role(auth.uid(), 'admin')`. Add explicit `IF v_old <> 'pending_review' THEN RAISE` guards in approve/deny so a stale UI cannot double-publish or deny a draft.
- **Input validation**:
  - Reason text sanitized via existing `sanitizeRecordFields` pipeline before sending; server-side `length(p_reason) BETWEEN 20 AND 2000` check inside `request_class_changes`.
  - Pre-submit checklist runs on the client *and* a server `submit_class_for_review` guard verifies non-empty `title`, `summary`, `track`, `outcomes`.
- **Audit**: every transition continues to insert into `class_audit` with actor, from/to status, reason. Surface this as a "History" expandable section on `ClassDetailPage`.
- **Notifications**: admin notification on submit; teacher notification on approve/deny/archive — through existing `notification.service` + transactional email queue (idempotent, retried, branded React Email templates). Four new template keys: `class_submitted_for_review`, `class_approved`, `class_changes_requested`, `class_archived`.
- **Rate limit**: server check inside `submit_class_for_review` — same `auth.uid()` cannot transition more than 10 classes/hour (`rate_limit_attempts` action `class_submission`).
- **Defense-in-depth**: Discord webhook wrapped in existing `CircuitBreaker`; failure does not roll back publish (graceful degradation).
- **Grid security**: AG Grid only renders rows the underlying RLS already authorizes — admin grid uses `listAll`, teacher grid uses `listMine`. No row-level filter is trusted client-side for security.

---

## Technical changes (deliverables)

1. **Bug fix** (root cause): `src/services/class.service.ts` — rename `_class_id` → `p_class_id`, add `p_cohort_ids` to `submitForReview`, `_reason` → `p_reason`. Mirror in `cohort.service.ts` if same pattern.
2. **Server-side hardening migration**:
   - Status-precondition guards on `approve_and_publish_class` and `request_class_changes`.
   - Reason length check + required-field check.
   - Per-user submission rate-limit check.
3. **Admin queue**: rebuild `AdminClassesPage` on `<ThemedAgGrid gridId="admin-classes">` with status-chip quick filters, color-pill status renderer, owner cell renderer, and inline action buttons that open the shared approve/deny/archive modals. Sidebar count badge driven by `useQuery(['classes','pending-count'])`.
4. **Detail page**: new `ApprovalActions` component on `ClassDetailPage` with Approve / Request Changes (modal w/ reason) / Archive (modal w/ reason), pre-submit checklist dialog for teachers, and an audit-history expandable section.
5. **Teacher dashboard**: rebuild `MyClassesPage` on `<ThemedAgGrid gridId="my-classes">` with quick-filter chips, "Changes requested" chip + inline reason cell renderer, and a Submit action button per row when status is `draft`.
6. **Notifications**: 4 template hooks fired after each RPC call (fire-and-forget with retry queue).
7. **BDD**: scenarios `CLS-APPR-001` … `CLS-APPR-012` covering all 4 transitions, the rate limit, the pre-submit checklist, the audit row, the notifications fan-out, the RLS denial paths, the regression test (`p_class_id` arg name), and the AG Grid filter/persistence behaviors. Tri-layer Then-clauses ([UI]/[DB]/[Code]).

---

## Files in scope

```text
src/services/class.service.ts                          (bug fix + arg names)
src/services/cohort.service.ts                         (same audit)
src/pages/AdminClassesPage.tsx                         (rebuild on AG Grid)
src/pages/ClassDetailPage.tsx                          (approval actions + history)
src/pages/MyClassesPage.tsx                            (rebuild on AG Grid)
src/components/classes/ApprovalActions.tsx             (new)
src/components/classes/PreSubmitChecklist.tsx          (new)
src/components/classes/RequestChangesDialog.tsx        (new)
src/components/classes/ArchiveDialog.tsx               (new)
src/components/classes/ClassAuditHistory.tsx           (new)
src/components/classes/grid/StatusPillRenderer.tsx     (new — AG Grid cell)
src/components/classes/grid/OwnerCellRenderer.tsx      (new — AG Grid cell)
src/components/classes/grid/RowActionsRenderer.tsx     (new — AG Grid cell)
src/services/notification.service.ts                   (4 new template hooks)
supabase/migrations/<ts>_class_approval_hardening.sql  (guards + rate-limit)
bdd_scenarios                                          (CLS-APPR-001..012)
```

---

## Out of scope

- A separate "denied" enum value (modeled as draft + audit reason — cleaner UX).
- Multi-reviewer / approval thread with comments (follow-up if Tech Fleet wants peer review).
- Versioning of class content across approvals.