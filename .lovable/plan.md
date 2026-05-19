## Goal
When an admin marks an applicant as **Active Participant** ("Accepted") on a project, the Tech Fleet Discord bot posts a welcome message in channel `1506083368679379044` mentioning the new member and their project role.

## Message format
```
<@DISCORD_USER_ID> welcome to the <@&PROJECT_ROLE_ID>

Say hello to your teammates in the project channels!

We will start onboarding soon.

Please go to <id:browse> to set the project channels in your menu.

Watch this video on how to do this: https://www.youtube.com/watch?v=ht35r4GSwoY
```
- `<@USER_ID>` pings the new member.
- `<@&ROLE_ID>` renders as the project role name as a colored mention (e.g. "@Design Researcher — Lewis Foundation").
- `<id:browse>` is Discord's native deep-link to the server's **Channels & Roles** picker.

## Where it hooks in
Existing path: `supabase/functions/notify-applicant-status/index.ts` already runs section "5. Discord role assignment for active_participant" when status flips to `active_participant`. We piggyback on the same gate so the welcome post only fires once, in the same flow, with no new RPC/cron.

## Implementation (1 file edit, 0 new tables)

**Edit `supabase/functions/notify-applicant-status/index.ts`**
- Add constant `WELCOME_CHANNEL_ID = "1506083368679379044"`.
- Inside the existing `if (newStatus === 'active_participant')` block, right after a successful `assignDiscordRole` (so we don't welcome someone whose Discord linkage failed), call a new local helper `postProjectWelcome(...)`.
- Helper does:
  - `POST https://discord.com/api/v10/channels/${WELCOME_CHANNEL_ID}/messages` via the shared `discordFetch` wrapper (auto-retry, circuit-breaker logging).
  - `Authorization: Bot ${DISCORD_BOT_TOKEN}` (already a project secret).
  - Body: `{ content, allowed_mentions: { parse: ["users", "roles"] } }` so the user + role mentions actually ping, but `@everyone`/`@here` cannot be injected.
- Idempotency: write an `audit_log` event `discord_welcome_posted` keyed on `application_id`; before posting, query for an existing row and skip if found. Prevents duplicate welcomes when an admin toggles status back and forth.
- Failure handling: wrap in try/catch, log `discord_welcome_post_failed` to audit, never throw — same non-blocking pattern used by the role-assignment block above it.

## Edge cases handled
- **No `discord_role_id` on project** → skip welcome (no role to mention; message would be meaningless).
- **No `discord_user_id` on applicant** → skip welcome (already blocked upstream by `ApplicantStatusDropdown` pre-flight, but defensive).
- **Discord API 5xx / rate limit** → `discordFetch` retries with backoff; final failure emits `external_api_failure` and `discord_welcome_post_failed` audit rows surfaced in System Health → Triage.
- **Status re-set to Active Participant after rollback** → idempotency check on audit log prevents double-posting.
- **Webhook flood prevention** → reuses existing per-request audit-wrapper rate limiting; no new endpoint exposed.

## BDD scenarios (added to `bdd_scenarios` table)
- `DISCORD-WELCOME-001` Successful welcome post on first acceptance — [UI] toast confirms, [DB] `audit_log` has `discord_welcome_posted`, [Code] `discordFetch` returns 200.
- `DISCORD-WELCOME-002` Idempotency on re-acceptance — second flip to Active Participant does NOT post again — [DB] only one `discord_welcome_posted` row per application.
- `DISCORD-WELCOME-003` Missing project role gracefully skips — [DB] no `discord_welcome_posted` row, no failure log.
- `DISCORD-WELCOME-004` Discord API failure logs and does not block status change — [UI] status still updates, [DB] `discord_welcome_post_failed` audit row, [Code] `external_api_failure` emitted for Triage.

## Out of scope
- New table, new edge function, new cron — none needed.
- Changing the existing role-assignment flow, agreement trigger, or notification emails.
- Per-project welcome-channel override (one global channel for now per your request).

## Effort
~15 min: one helper + one call site + idempotency check + 4 BDD rows. Tested via `supabase--curl_edge_functions` against a test applicant.
