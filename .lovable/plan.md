## Goal

Add an opt-in **"Activate your Observer access in Discord"** lesson as the final step of the Observer course. On opt-in, the server grants both Discord roles in order:

1. **Projects** role — `1212223190257111071` (prerequisite)
2. **Observers** role — `1211716621828366379`

Both IDs stored as edge-function secrets. Reuses existing `manage-discord-roles` + `discord_role_grant_queue` self-heal pipeline. **UX is the headline goal**: confirmation feels celebratory (mirrors the Discord-connect success), and the user is told exactly what to do next.

---

## Secrets (added in build mode)

- `DISCORD_PROJECTS_ROLE_ID` = `1212223190257111071`
- `DISCORD_OBSERVERS_ROLE_ID` = `1211716621828366379`

---

## DB migration — `observer_role_optins`

- `user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
- `opted_in_at timestamptz NOT NULL DEFAULT now()`
- `discord_user_id text NOT NULL`
- `projects_role_granted_at timestamptz`
- `observers_role_granted_at timestamptz`
- `last_error text`
- RLS: user `SELECT` own; admins `SELECT` all. **No client writes** — service role only.
- `BEFORE UPDATE` trigger blocks changes to `user_id` / `discord_user_id`.

Reuses existing `discord_role_grant_queue` (drained by `useDiscordRoleRetry` next login).

---

## New edge function `grant-observer-role`

JWT-validated in code. Body: `{ confirm: z.literal(true) }`. POST only, 1 KB cap, project-standard CORS.

1. `getClaims()` → `userId = claims.sub` (body never carries user_id or role_id).
2. Rate limits: 5/hr & 20/day per user, 30/hr per IP → 429 + audit `_rate_limited`.
3. Verify all `ALL_OBSERVER_LESSON_IDS` complete in `course_progress` → else 403 + audit `_failed`.
4. Read `profiles.discord_user_id` + verified flag → 409 `discord_not_linked`.
5. **Idempotent:** if both `*_granted_at` set → 200 `{ alreadyGranted: true }` with no Discord call.
6. Read both role IDs from `Deno.env`. Missing → 500 + audit, no Discord call.
7. `discordFetch` (CircuitBreaker + retry):
   - `PUT .../roles/1212223190257111071` → set `projects_role_granted_at`.
   - `PUT .../roles/1211716621828366379` → set `observers_role_granted_at`.
8. Upsert opt-in row, write hash-chained `audit_log`: `_granted` / `_failed` / `_rate_limited`.
9. On Discord failure → `queue_discord_role_grant` for any unfulfilled role; return `{ ok: false, queued_for_retry: true }`.

`supabase/config.toml`: register with default `verify_jwt = false` (in-code validation, project standard).

---

## Course content — new final lesson `obs-8`

Appended to "Conduct & Next Steps":
- **id:** `obs-8`
- **Title:** "Activate your Observer access in Discord"
- **sourceUrl:** the Tech Fleet guide page you sent.
- **Content (in your voice, condensed):** roles as "hats"; the four ways to be involved (Observer / Apprentice / Co-lead / Group Mentor); why Observer is the best first step; the manual two-step Discord path (`#project-role` → `#observers-get-ready`); what unlocks (project channels, per-project Observers channel, `#calling-all-observers` daily alerts); reminder to also check the Tech Fleet Web Calendar. Closing: *"Use the panel below to grant the roles automatically — or skip and do it manually. Either choice completes the lesson."*

---

## UX — maxed-up confirmation flow

This is the part you specifically called out. Pattern mirrors the Discord-connect success state.

### Component: `src/components/courses/ObserverRoleOptInCard.tsx`

A single dark-card with five distinct, animated states. Every state has a clear icon, color, and a primary next-action.

**State 1 — Discord not linked**
- Inline `<ProfileDiscordConnector />` with helper: *"Link your Discord first so we know which account to grant the roles to."*

**State 2 — Linked, ready to opt in**
- Heading: *"Want us to grant your Discord roles automatically?"*
- Subtext lists exactly what will happen: *"We'll add the **Projects** role and the **Observers** role to your Tech Fleet Discord profile."*
- Primary button: **"Grant me Projects + Observers roles"** (emerald)
- Secondary text-link: *"Skip — I'll do it manually in Discord"* (still marks lesson complete)

**State 3 — Granting (loading)**
- Disabled button + spinner + step indicator: *"Granting Projects role… → Granting Observers role…"* updated live via two server-event milestones.
- `aria-live="polite"` announces each step.

**State 4 — Success ✅ (the celebratory state — mirrors Discord-connect success)**
- Emerald gradient card, large ✓ icon, **subtle confetti burst** (one-shot, respects `prefers-reduced-motion`).
- Headline: *"You're an Observer! 🎉"*
- Confirmation chips: `✓ Projects role granted` `✓ Observers role granted` with timestamp.
- Top-center 30s emerald toast: *"Discord roles granted — you're ready to start observing."*
- **"What to do next" checklist** (the user-flow you asked for) — three numbered cards stacked vertically, each clickable:
  1. **📅 Pick a project meeting** → button "Open Events Calendar" → links to `/events` (in-app calendar).
  2. **💬 Explore project Discord channels** → button "Open Discord" → deep-links `discord://` with web fallback `https://discord.com/channels/{guild}` to the Projects category.
  3. **🔔 Watch for daily alerts** → static helper: *"New `#calling-all-observers` posts will ping you each day with meetings to join."*
- Footer mini-CTA: *"Then come back and post your reflections in `#observer-reflections`."*
- A11y: card uses `role="status"`, success heading is focusable so screen readers announce it.

**State 5 — Partial / Queued ⚠️**
- Amber card with ⏳ icon.
- Shows which role succeeded ("✓ Projects granted") and which is queued ("⏳ Observers — retrying on next login").
- Helper: *"You can also do it manually now in `#observers-get-ready` while we keep retrying."*
- Same "What to do next" checklist below — degrade gracefully.
- Toast: blue *"We saved your request. We'll finish granting on your next login."*

### Hook: `src/hooks/use-observer-role-optin.ts`
- Wraps the edge function. Optimistic UI. Toasts via `sonner` (30s top-center, project standard).
- Surfaces partial-grant state cleanly.

### Page wiring
- `GenericCoursePage` extended with optional `interactiveSlot?: (lessonId) => ReactNode` (additive, no regression to other courses).
- `ObserverCoursePage` passes the slot, rendering `<ObserverRoleOptInCard />` only on `obs-8`.
- Lesson auto-marks complete on success **or** "skip manually" so the course bar always reaches 100%.

### WCAG 2.0/3.0
- 4.5:1 contrast, focus rings, full keyboard nav, color-blind safe icons (✓/⚠️/⏳ alongside color), `prefers-reduced-motion` disables confetti, `aria-live` regions on every state change, success heading auto-focuses.

---

## Defense-in-depth security recap

- Identity from JWT `sub` only — body cannot specify user_id or role_id.
- Server re-verifies lesson completion + Discord verification via service role.
- Role IDs + bot token in edge env only (never in JS bundle or DB).
- Rate limits: 5/hr & 20/day per user, 30/hr per IP.
- Idempotent replay (no extra Discord call, no extra audit `_granted`).
- RLS denies client writes; immutable user_id/discord_user_id trigger; PK prevents dupes.
- Hash-chained `audit_log` (DELETE-blocked).
- ≥3 failures / 5min → admin push via existing critical-push cron.
- POST only, Origin/Referer allowlist.

---

## BDD scenarios → `bdd_scenarios` (tri-layer)

Functional:
- `OBS-ROLE-001` Happy path — [UI] confetti + success card + 3-step "next" checklist + emerald toast within 3s; [DB] both `*_granted_at` set, audit `_granted`; [Code] 200, Discord member has both roles.
- `OBS-ROLE-002` Discord not linked → [UI] connector card; [DB] no row; [Code] 409.
- `OBS-ROLE-003` Lessons incomplete → [UI] panel hidden + helper; [DB] no row; [Code] 403.
- `OBS-ROLE-004` Idempotent replay → [UI] success card with original timestamp, no second confetti; [DB] no new row; [Code] 200 `alreadyGranted`, zero Discord calls.
- `OBS-ROLE-005` Both roles fail → [UI] amber queued card + blue toast + next-steps still shown; [DB] queue rows for both + `last_error`; [Code] 502 `queued_for_retry`.
- `OBS-ROLE-006` Skip manually → [UI] lesson marked complete, course 100%; [DB] no opt-in row; [Code] no edge call.
- `OBS-ROLE-007` Projects ✓ / Observers ✗ → [UI] partial-grant card (one ✓ one ⏳); [DB] only `projects_role_granted_at` set, queue row for Observers; [Code] 502 `queued_for_retry`.
- `OBS-ROLE-008` Next-step CTAs → [UI] "Open Events Calendar" navigates to `/events`; "Open Discord" opens deep link; [DB] no-op; [Code] no edge call.

Security:
- `OBS-ROLE-SEC-001` No JWT → 401, no row.
- `OBS-ROLE-SEC-002` Lessons incomplete → 403, audit `_failed`.
- `OBS-ROLE-SEC-003` Body injects `user_id` / `role_id` → ignored.
- `OBS-ROLE-SEC-004` 6th call/hr → 429, audit `_rate_limited`.
- `OBS-ROLE-SEC-005` Tampered JWT → 401, no Discord call.
- `OBS-ROLE-SEC-006` Replay after granted → 200 idempotent, no new audit `_granted`.
- `OBS-ROLE-SEC-007` Discord 403 → queued + audit; no DB success row.

A11y:
- `OBS-ROLE-A11Y-001` Reduced-motion → confetti disabled, success card still rendered.
- `OBS-ROLE-A11Y-002` Keyboard-only path → opt-in → success → next-step CTAs all reachable in tab order; live region announces each transition.

---

## Build order (after approval)

1. `add_secret` request: both role IDs.
2. Migration: `observer_role_optins` + RLS + immutability trigger.
3. Edge function `grant-observer-role` (deploy + smoke).
4. `ObserverRoleOptInCard` (5 states + confetti + next-step checklist), `use-observer-role-optin` hook, `GenericCoursePage` `interactiveSlot`.
5. Append `obs-8` lesson to `src/data/observer-course.ts`.
6. Insert all BDD scenarios into `bdd_scenarios`.
7. Save memory `mem://features/observer-role-optin`.
8. End-to-end smoke on a Discord-linked test account: opt-in (confetti + next steps), idempotent replay, skip path, rate-limit reject, simulated-failure queue drain, partial-grant recovery, keyboard-only walkthrough, reduced-motion check.