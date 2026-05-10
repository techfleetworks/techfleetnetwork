## Goal

Tear out everything related to the in-app Support widget and ticketing system (Chatwoot integration). After this is done, there will be no Support page, no admin Tickets page, no embedded chat widget, no `tickets`/`ticket_events` tables, and no Chatwoot edge functions.

The existing **Feedback** flow (`/feedback`) and the **Error Triage Queue** (admin → System Health) are unrelated and stay untouched.

## What gets removed

### Frontend (React)
- `src/components/SupportWidget.tsx` — Chatwoot widget loader + `openSupportWidget` helper.
- `src/pages/SupportPage.tsx` — `/support` route (user-facing ticket list).
- `src/pages/AdminTicketsPage.tsx` — `/admin/tickets` route (admin ticket list).
- `src/App.tsx` — drop the two lazy imports and the `/support` and `/admin/tickets` `<Route>` entries.
- `src/components/AppLayout.tsx` — remove the `SupportWidget` import and both `<SupportWidget />` mount points.
- `src/components/AppSidebar.tsx` — remove the `Support` nav item (`/support`, `LifeBuoy` icon); drop the icon import if it becomes unused.

### Edge functions (deleted from project + Supabase)
- `supabase/functions/chatwoot-widget-token/`
- `supabase/functions/chatwoot-webhook/`
- `supabase/functions/chatwoot-create-ticket/`

### Database (migration)
- Drop tables `public.ticket_events` and `public.tickets` (CASCADE — covers the FKs and RLS policies on both).
- Drop enums `public.ticket_inbox_type` and `public.ticket_status`.
- Note: `tickets.owner_user_id` references `auth.users` — covered by table drop, no auth-schema changes.

### BDD scenarios (data delete)
Delete the four Chatwoot/ticket scenarios from `bdd_scenarios`:
- "Trainee creates a support ticket via embedded widget"
- "Status changes in Chatwoot sync to Tech Fleet mirror"
- "Bug-inbox tickets flow into the triage queue"
- "RLS prevents trainees from seeing other trainees tickets"

### Cleanup of incidental references
- `src/services/error-reporter.service.ts` — keep the global `FunctionsFetchError` / "Failed to send a request to the Edge Function" suppression patterns (still useful for any optional function), but remove the comment that names "Chatwoot support widget" so the rationale doesn't reference a deleted feature.
- `src/integrations/supabase/types.ts` — auto-regenerated after the migration; no manual edit.

### Out of scope (not touched)
- `DiscordUsernameTutorial.tsx` external link to `support.discord.com` — unrelated.
- `project-training-course.ts` external link with the word "supported" — unrelated.
- The Chatwoot **secrets** (`CHATWOOT_BASE_URL`, `CHATWOOT_HMAC_KEY`, `CHATWOOT_WEBSITE_TOKEN`, `CHATWOOT_WEBHOOK_SECRET`, `CHATWOOT_SUPPORT_INBOX_IDS`, `CHATWOOT_BUG_INBOX_IDS`, `CHATWOOT_INTERNAL_INBOX_IDS`) — left in place; they are inert with the functions gone. Removing secrets is a separate manual action and you can ask me to delete them after.
- Feedback page, error triage queue, notifications, announcements — untouched.

## Verification

- Build passes (no dangling imports of `SupportWidget`, `openSupportWidget`, `SupportPage`, `AdminTicketsPage`).
- Sidebar no longer shows "Support".
- Visiting `/support` and `/admin/tickets` falls through to the 404 page.
- `select to_regclass('public.tickets')` returns null after migration.
- Three `chatwoot-*` edge functions no longer appear in Supabase function list.
