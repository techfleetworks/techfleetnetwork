# Make Blast available on every project for any admin

## Goal
Today, the Blast tab only appears on a project where the signed-in user is the assigned `coordinator_id`. You want any admin to send blasts on any project shown in Recruiting Center, regardless of phase/status or whether a coordinator is set.

## Changes

### 1. Frontend gate — `src/pages/RosterProjectDetailPage.tsx`
- Replace the `isCoordinator` gate with an `isAdmin` check (read from existing auth/role context already used elsewhere in the admin area).
- Always render the `Blast` tab and its `<ResponsiveTabsContent value="blast">` block when the viewer is an admin.
- Pass `canSend={isAdmin}` (renamed from `isCoordinator`) into `<ProjectBlastComposer>`.

### 2. Composer — `src/components/recruiting/ProjectBlastComposer.tsx`
- Rename the `isCoordinator` prop to `canSend` (or just rely on admin context); update the `enabled:` query flag, the empty-state guard, and the disabled-button logic so the composer is usable for any admin.
- No copy changes beyond removing coordinator-specific wording if any remains.

### 3. Edge function — `supabase/functions/send-project-blast/index.ts`
- Remove the `project.coordinator_id !== userId` block (lines ~120–135). The admin-role check immediately above (lines 104–118) is retained as the sole authorization gate.
- Keep the project lookup (still need `friendly_name` / `clients(name)` for the email), the rate limit, recipient query, audit logging, and everything else unchanged.
- Audit log `project_blast.denied` reason `not_coordinator` is no longer emitted; `not_admin` remains.

### 4. RLS on `project_blasts`
- If the insert/select policy currently restricts to `coordinator_id = auth.uid()`, broaden it to `has_role(auth.uid(), 'admin')`. I'll confirm the current policy during implementation and migrate only if needed.

### 5. BDD scenarios — `bdd_scenarios` table
Add tri-layer (UI/DB/Code) scenarios under feature `Project Blast`:
- PB-017 Any admin sees Blast tab on any project
- PB-018 Non-admin coordinator no longer sees Blast tab (admin-only now)
- PB-019 Edge function accepts blast from admin who is not the coordinator
- PB-020 Edge function still rejects non-admin with 403 `not_admin`

## Out of scope
- No changes to email template, rate limit, recipient selection, history widget, or System Health observability.
- No new UI surfaces.

## Risk
Low. Removes a restriction; admin role check + rate limit + audit logging stay intact.
