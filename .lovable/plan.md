## Project Blast — email all applicants from a project (hardened + observable)

A project coordinator who is also an admin opens a project in the Recruiting Center, drafts a subject + rich-text body in a Lu.ma-Blast-style composer (advanced view only), previews recipients, and sends. Each applicant receives a branded transactional email **and** an in-app notification. Every send is observable from the existing System Health dashboard.

### Access control — admin-only, end-to-end

- **Hard rule:** the only identity allowed to compose, send, or read a blast is the **currently authenticated admin** (`has_role(auth.uid(), 'admin')`). Coordinator assignment scopes *visibility* (admins see/send blasts only for projects they coordinate, unless super-admin), but admin role is the gate.
- **Three independent layers must all agree** before a send proceeds:
  1. **UI gate** — `Blast` tab + Send button only render when `useAdmin().isAdmin === true` AND `project.coordinator_id === auth.uid()` (or super-admin). Disabled state never sends.
  2. **Edge function gate** — re-derives identity from JWT via `supabase.auth.getClaims(token)`, never trusts request body for `sender_id`; re-checks `has_role` and `coordinator_id` server-side. Reject → 403 + audit row.
  3. **Database RLS** — `project_blasts` and `project_blast_recipients` enforce admin role + coordinator match for SELECT/INSERT. UPDATE/DELETE forbidden (append-only).
- **MFA gate reuse:** sending requires the existing admin TOTP gate (`mem://features/admin-passkey-login-gate`); expired grace → step-up prompt, no bypass.
- **No service-role from client.** All privileged work happens inside the edge function after JWT-derived identity is verified.

### Where it lives

- `RosterProjectDetailPage` → new `Blast` tab next to Application Analysis + Project Roster, gated as above.
- System Health dashboard → blasts surface in the existing **Email** tab plus a small **Project Blasts** widget (see Observability).

### Composer UI (advanced view only)

`src/components/recruiting/ProjectBlastComposer.tsx`
- Subject line, required, trimmed, max 150 chars (Zod both sides).
- `RichTextEditor` (TipTap, same as announcements).
- Audience summary: "This will reach **N applicants** for *Project X*." Status filter chips (default `completed`).
- Preview tab renders the email + sample in-app notification.
- Sticky footer: `Cancel` · `Send blast`. `<ConfirmDialog>` with `actionLabel="Send blast"`, recipient count announced via `LiveAnnouncer`.
- WCAG: labelled inputs, `aria-live`, focus trap, `prefers-reduced-motion`.

### Data model

- `project_blasts`: `id`, `project_id`, `sender_id` (set by trigger to `auth.uid()`, never client-supplied), `subject` (1–150), `body_html` (≤50KB, sanitized by BEFORE INSERT/UPDATE trigger via `sanitize_user_html()`), `audience_filter jsonb default '{"statuses":["completed"]}'`, `recipient_count`, `email_sent_count`, `email_failed_count`, `notification_sent_count`, `status` ∈ {queued,sending,sent,partial,failed}, `error`, `created_at`, `sent_at`.
- `project_blast_recipients`: `id`, `blast_id`, `user_id`, `email_hash` (sha256 of lowercased email), `email_status` ∈ {queued,sent,failed,suppressed}, `email_message_id` (links to `email_send_log.message_id`), `notification_id`, `created_at`. Unique `(blast_id, user_id)`.

**RLS (deny-by-default, append-only)** — `ENABLE` + `FORCE ROW LEVEL SECURITY` on both. SELECT/INSERT only when admin AND (super-admin OR `auth.uid() = projects.coordinator_id`). No UPDATE/DELETE policies (service-role only). BEFORE INSERT trigger forces `sender_id := auth.uid()` and rejects null.

### Sending pipeline — `supabase/functions/send-project-blast/index.ts`

1. Strict CORS, POST-only.
2. Auth: requires `Authorization: Bearer …`; `auth.getClaims(token)`. Missing → 401.
3. Identity re-verify (admin + coordinator) via user-scoped client; mismatch → 403 + `audit_log` row (`action=project_blast.denied`).
4. Zod `.strict()` body validation: `project_id` uuid, `subject` 1–150, `body_html` ≤50KB, `audience_filter.statuses` enum subset. Reject extras → 400.
5. Server-side HTML sanitization before render and insert (defense in depth on top of DB trigger). Allow-list only; strips `<script>`, event handlers, `javascript:`, `<iframe>`, `<object>`, `<embed>`, `<style>`, `<form>`.
6. Rate limit: `enforce_rate_limit('project_blast', userId, projectId, 5/hour, 20/day)` → 429 + `Retry-After`.
7. Idempotency: required `Idempotency-Key` header (UUID); 24h replay table returns original `blastId`.
8. Recipient resolution server-side only (joins `project_applications` + `profiles`); cap 5,000.
9. Suppression check against `suppressed_emails`.
10. Send loop: `Promise.allSettled` batches of 25, wrapped in `CircuitBreaker` with exponential backoff. Per recipient:
    - Email via `send-transactional-email` with `templateName='project-blast'`, `idempotencyKey='blast-${blastId}-${userId}'` → links into `email_send_log` with this `message_id`.
    - In-app notification insert into `notifications` with `kind='project_blast'`, sanitized `body_html`, `link=/projects/${projectId}`.
11. Audit: hash-chained `audit_log` row per blast (`action=project_blast.send`) with `blast_id`, `recipient_count`, `subject_hash`.
12. PII hygiene: never echoes JWT/email/body in errors; structured logs use redaction wrapper.
13. Returns `{ blastId, recipientCount }` immediately; UI subscribes via realtime to `project_blasts.id` for progress.

### Email template

`supabase/functions/_shared/transactional-email-templates/project-blast.tsx` — React Email layout (Tech Fleet Blue header, Poppins). `subject` as `<Heading>`; `bodyHtml` via `dangerouslySetInnerHTML` **only after server sanitization**. System unsubscribe footer auto-appended. Registered in templates registry.

### Observability — System Health UI integration

The `system-health` dashboard already deduplicates `email_send_log` by `message_id`. Blast emails inherit that pipeline because they go through `send-transactional-email`, but we add explicit surfacing so admins can monitor blasts at a glance:

1. **Email tab — template filter** auto-includes `project-blast` (it appears via the existing distinct-template-name query). Color-coded status badges and per-row error reasons work without changes.
2. **New "Project Blasts" widget** (`src/components/admin/system-health/ProjectBlastsHealthCard.tsx`) on the System Health page, alongside Email Pipeline Health:
   - Stat cards: blasts in last 24h / 7d / 30d, recipients reached, email success rate, failure rate, suppressed count.
   - Recent blasts table (top 10): `Sent at`, `Project`, `Coordinator`, `Subject`, `Recipients`, `Sent`, `Failed`, `Suppressed`, `Status` badge.
   - Row click → drawer with per-recipient outcomes (joined `project_blast_recipients` ⇄ `email_send_log` by `message_id`, deduped latest status).
   - Subscribes to `project_blasts` realtime for live updates (RLS still admin-gated; uses the existing realtime admin policy on `realtime.messages`).
3. **New SECURITY DEFINER RPC** `get_project_blast_health(window_days int)` returns aggregated stats joining `project_blasts` ⇄ `project_blast_recipients` ⇄ deduped `email_send_log`. Admin-only `EXECUTE` grant; revoked from `anon`/`authenticated` non-admins via internal `assert_admin()` guard inside the function body.
4. **Triage hookups:** failed blast sends emit a structured error (`feature='project_blast'`) so the existing **Triage** tab and **Triage Critical Push** memory rules pick them up automatically — no separate alert path.
5. **Audit tab:** existing audit-log viewer surfaces `project_blast.send` and `project_blast.denied` rows with no extra work.

### Per-project history view

Below the composer, AG Grid card lists prior blasts for this project with the same columns as the System Health widget but scoped to one project. Row click opens a read-only modal of the rendered email.

### Notifications

Reuse existing `notifications` table + realtime. New kind `project_blast` registered in `src/lib/notifications/kinds.ts`, surfaced in bell + Notifications page filter chip with email icon, links to project openings page.

### BDD scenarios (`bdd_scenarios`)

- `PB-001` Admin coordinator sends → `[UI]` toast "Blast sent to N members", System Health Project Blasts widget shows new row within 2s `[DB]` `project_blasts.status='sent'`, recipients match, `audit_log` appended, `email_send_log` rows tagged `template_name='project-blast'` `[Code]` 200 `{blastId,recipientCount}`.
- `PB-002` Non-admin → `[UI]` no Blast tab `[DB]` no rows `[Code]` 403.
- `PB-003` Admin not this project's coordinator (and not super-admin) → `[UI]` no Blast tab `[Code]` 403.
- `PB-004` Client tries to override `sender_id` → `[Code]` 400 (`.strict()`); trigger would also overwrite.
- `PB-005` Body contains `<script>`/`onerror=`/`javascript:` → `[DB]` stripped in `body_html` `[Code]` outbound email + notification HTML stripped.
- `PB-006` Subject blank or >150 → `[UI]` Send disabled `[Code]` 400.
- `PB-007` Same `Idempotency-Key` replayed → `[DB]` one row `[Code]` 200 with original `blastId`.
- `PB-008` 6th send within an hour → `[Code]` 429 + `Retry-After`.
- `PB-009` Suppressed email recipient → `[DB]` `email_status='suppressed'`, in-app notification still delivered, System Health widget suppressed counter increments.
- `PB-010` Realtime: applicant's notification badge increments within 2s.
- `PB-011` MFA grace expired → blocked, no DB writes, audit `denied=mfa_required`.
- `PB-012` 0 applicants → composer "No one has applied yet"; Send disabled.
- `PB-013` >5,000 recipients → 400, no partial send.
- `PB-014` Email tab in System Health filtered to `project-blast` shows deduped rows by `message_id` with correct latest status.
- `PB-015` Failed transactional send for one recipient → `[DB]` `project_blast_recipients.email_status='failed'`, blast `status='partial'`, Triage tab surfaces fingerprint `feature=project_blast`.
- `PB-016` Non-admin calling `get_project_blast_health` RPC → 403 from `assert_admin()` guard.

### Memory updates after build

- Update `mem://features/security/defense-in-depth` with the project-blast admin-only + coordinator-scoped + append-only constraints.
- New `mem://features/admin/project-blast` describing the hardening + observability rules.
- Extend `mem://features/admin/error-monitoring` to note `project-blast` template now flows into Email tab + Project Blasts widget.

### Out of scope

- Lu.ma "simple view", scheduled sends, segments beyond status, edit/recall after send (immutable by RLS), cross-project blasts.

### Files to add / change

Add:
- `supabase/migrations/<ts>_project_blasts.sql`
- `supabase/functions/send-project-blast/index.ts`
- `supabase/functions/_shared/transactional-email-templates/project-blast.tsx` (+ registry entry)
- `src/components/recruiting/ProjectBlastComposer.tsx`
- `src/components/recruiting/ProjectBlastHistory.tsx`
- `src/components/admin/system-health/ProjectBlastsHealthCard.tsx`
- `src/services/project-blast.service.ts`
- BDD seed `PB-001..016`.

Change:
- `src/pages/RosterProjectDetailPage.tsx` — gated `Blast` tab.
- `src/pages/SystemHealthPage.tsx` — mount `ProjectBlastsHealthCard`; verify Email tab template filter renders `project-blast`.
- `src/lib/notifications/kinds.ts` — register `project_blast`.
- `src/components/NotificationBell.tsx` / Notifications page filter — new kind chip.
