# Fix the "@." Discord label bug (with no-regression guards)

## Root cause (audit)

End-to-end trace of `profiles.discord_username` writes and renders:

1. **Legacy data in DB.** 162 profiles have a real `discord_user_id`. Of those:
   - **4** have `discord_username = ''`
   - **34** have `discord_username LIKE '.%'` (leading dot)
   - **0** have `discord_username = '.'` today, but the rendering logic would show `@.` for any such legacy row that still exists or that ever lands again.

2. **Source of the leading dot.** The helper `normalizeDiscordUsername(raw)` in `src/pages/ConnectDiscordPage.tsx` (line 175) and `src/components/profile/ProfileDiscordConnector.tsx` (line 41) prepends `.` to whatever the user types (`name = "." + name`). Historically that prefixed value was persisted to `profiles.discord_username` via an older free-text save path. The DB trigger `prevent_unverified_discord_change` (migration `20260428045905`) now blocks non-service-role writes, so new bad writes are limited to the service-role confirm path described below.

3. **Latent service-role hole.** `supabase/functions/resolve-discord-id/index.ts` confirm branch does:
   ```
   const confirmedUsername = member.user?.username ?? "";
   ```
   It will happily write `""` (and would write `.` if Discord ever returned one). No guard.

4. **Display falls straight through.** Both `ProfileDiscordConnector.tsx:214` and `ConnectDiscordPage.tsx:431` render:
   ```
   Connected as @{linkedDiscordUsername || profile?.discord_username}
   ```
   `""` → `@`, `.` → `@.`, `.foo` → `@.foo`.

5. **Why re-link "fixes it".** Re-link runs `resolve-discord-id` under the service role, which bypasses the trigger and writes the canonical `member.user.username` from Discord's API — the only path that can correct a legacy row today.

## Fix (5 layers, defense-in-depth so this can't regress)

### Layer 1 — Frontend display guard (never render `@` or `@.`)
Files: `src/components/profile/ProfileDiscordConnector.tsx`, `src/pages/ConnectDiscordPage.tsx`, plus new shared util `src/lib/discord/username.ts`.

- New shared helpers in `src/lib/discord/username.ts`:
  - `isUsableDiscordUsername(value)` — false for `null`, `undefined`, `""`, whitespace, `"."`, or any string whose trimmed/leading-`.`-stripped form is empty.
  - `normalizeDiscordSearchInput(value)` — trim, strip leading `@`, lowercase, **never prepend `.`** (replaces both copies of `normalizeDiscordUsername`).
- When the stored value is unusable, render `Connected to Discord` (no `@…`) plus a small inline "Refresh from Discord" button that triggers Layer 2's self-heal on demand.
- Remove the dot-prepend from `normalizeDiscordUsername` in both files; route through the new shared helper.

### Layer 2 — Self-heal on every sign-in (zero-click fix for affected users)
New edge function: `supabase/functions/repair-discord-username/index.ts` (JWT-required, idempotent, uses service role internally).

- Input: caller's JWT only (no body). Validates JWT via `userClient.auth.getClaims(token)` like sibling functions.
- If the caller's profile has `discord_user_id` set AND `discord_username` fails `isUsableDiscordUsername` OR `discord_username LIKE '.%'` AND the live Discord `member.user.username` does NOT start with `.`:
  - Calls `GET /guilds/{GUILD_ID}/members/{discord_user_id}` via the existing `discordFetch` wrapper.
  - If Discord returns a non-empty, non-just-dot username, updates `profiles.discord_username` via service-role client (bypasses the verified-write trigger).
  - **Never widens scope** — only touches `discord_username`, never `discord_user_id`, `has_discord_account`, or anything else. Preserves existing link integrity for all 162 already-linked members.
- Writes `audit_log` `discord_username_repaired` with old/new values for forensics.
- Refuses to write empty/just-dot values returned by Discord — closes the latent hole.

Client wire-up in `src/components/SelfHealingRunner.tsx` (already mounted inside `AuthProvider`):
- New hook `useDiscordUsernameRepair()` watches `profile`. If `profile.discord_user_id` is set and the stored username is unusable, fire-and-forget `repair-discord-username` once per session (guarded by a `useRef` + `sessionStorage` flag `tfn_discord_repair_attempted`). On 200, calls `refreshProfile()`. Errors are swallowed (graceful degradation per `mem://tech/graceful-degradation`).

### Layer 3 — Tighten the write path (regression lock)
File: `supabase/functions/resolve-discord-id/index.ts`.

- In the `confirm_user_id` branch, before the `update`, validate:
  - `member.user?.username` is a non-empty string
  - `member.user.username !== "."`
  - `member.user.username.replace(/^\.+/, "").trim().length > 0`
- If not, return `502 { error: "Discord did not return a usable username — please retry" }` and write `audit_log` `discord_link_rejected_empty_username`. Never persist `""` or `.`.
- Unit-test guard added to `src/test/services/profile.service.test.ts` so a future refactor cannot silently re-allow this.

### Layer 4 — One-shot admin backfill for the existing 38 rows
New admin-only edge function: `supabase/functions/backfill-discord-usernames/index.ts`.

- Requires JWT + `has_role(uid, 'admin')`.
- Selects every profile where `discord_user_id IS NOT NULL AND discord_user_id <> ''` AND (`discord_username` fails the usability check OR `discord_username LIKE '.%'` AND live Discord username does not start with `.`).
- Iterates with `discordFetch` (circuit-breaker + exponential backoff per `src/lib/circuit-breaker.ts`).
- Updates each profile only when the live Discord username is usable AND different. Never touches `discord_user_id`, `has_discord_account`, or any other column → existing connections preserved.
- Returns `{ scanned, repaired, skipped_unchanged, skipped_discord_dot_legit, errors[] }`.
- Surfaced in **System Health → Discord** tab as a "Repair Discord usernames" button. Layer 2 will absorb most cases at sign-in; this button cleans up dormant accounts.

### Layer 5 — Database belt-and-suspenders (regression lock)
Migration adds a CHECK-style validation trigger (not a CHECK constraint, per `mem://tech/database/data-integrity`):

```
create or replace function public.validate_discord_username()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.discord_user_id is not null and new.discord_user_id <> '' then
    if new.discord_username is not null
       and (btrim(new.discord_username) = ''
            or new.discord_username = '.'
            or btrim(regexp_replace(new.discord_username, '^\.+', '')) = '') then
      raise exception 'discord_username cannot be empty or only dots when discord_user_id is set';
    end if;
  end if;
  return new;
end$$;

create trigger validate_discord_username_trg
before insert or update of discord_username, discord_user_id on public.profiles
for each row execute function public.validate_discord_username();
```

- Fires only when `discord_user_id` is present, so existing rows with empty username + no link are untouched.
- Runs AFTER `prevent_unverified_discord_change`, so user free-text edits still no-op safely.
- One-time data sanitization in the same migration: for rows that currently have `discord_user_id` set but unusable `discord_username`, set `discord_username = NULL` so the trigger doesn't reject Layer 2/4 repair updates. Crucially **does not** clear `discord_user_id` or `has_discord_account` — every member stays linked, only the broken label is normalized to NULL pending repair.

## Non-regression guarantees (what protects each layer)

| Risk | Guard |
|---|---|
| New code re-introduces dot-prefix at save time | Layer 5 trigger rejects, Layer 3 edge-fn refuses, ESLint test on `normalizeDiscordUsername` callers via Layer 1 helper |
| Discord returns empty username | Layer 3 rejects write, Layer 2 refuses to overwrite, Layer 5 trigger backstops |
| Display still shows `@.` for a transient bad value | Layer 1 `isUsableDiscordUsername` short-circuits the render |
| Existing 162 linked members lose their connection | Layers 2/4 only update `discord_username`, never `discord_user_id`/`has_discord_account`; Layer 5 data step sets unusable values to NULL (link intact) |
| Migration accidentally wipes link | Trigger only fires when `discord_user_id` is present; data step only NULLs `discord_username`, never the link columns; migration is wrapped in a single transaction |
| Future Discord usernames legitimately start with `.` | Backfill skips rows where the live Discord username also starts with `.` (preserves them) |
| Repair edge function loops | `sessionStorage` once-per-session ref + server-side check that update only runs when a change is needed |

## BDD scenarios (inserted into `bdd_scenarios`, tri-layer Then-clauses)

1. **DISCORD-LABEL-USABLE-RENDER-001** — Profile renders `Connected to Discord` (no `@…`) when `discord_username` is empty/`.`/leading-only-dot.
   - [UI] no `@` token visible; "Refresh from Discord" button visible
   - [Code] `isUsableDiscordUsername` returns false for `''`, `'.'`, `'   '`, `'..'`
   - [DB] row unchanged by render

2. **DISCORD-LABEL-USABLE-RENDER-002** — Profile renders `@{username}` when stored value is usable (`alice`, `.alice`, `alice.42`).
   - [UI] exactly `@alice` / `@.alice` / `@alice.42`
   - [Code] helper returns true
   - [DB] read-only

3. **DISCORD-CONFIRM-REJECTS-EMPTY-001** — `resolve-discord-id` confirm branch rejects writes when Discord returns empty/dot-only username.
   - [UI] inline error "Discord did not return a usable username — please retry"
   - [Code] returns 502, no `profiles.update` call issued
   - [DB] `audit_log` row `discord_link_rejected_empty_username` exists; `profiles.discord_username` unchanged

4. **DISCORD-CONFIRM-ACCEPTS-DOT-PREFIX-LEGIT-001** — When Discord legitimately returns `.alice`, confirm stores it verbatim.
   - [UI] `@.alice`
   - [Code] update payload `discord_username: '.alice'`
   - [DB] row reflects `.alice`

5. **DISCORD-SELFHEAL-ON-SIGNIN-001** — Sign-in with unusable stored username triggers one repair call and updates the label without user action.
   - [UI] label updates from `Connected to Discord` to `@{canonical}` within 2s
   - [Code] `repair-discord-username` called exactly once per session
   - [DB] `profiles.discord_username` updated, `discord_user_id` and `has_discord_account` unchanged, `audit_log` `discord_username_repaired` row written

6. **DISCORD-SELFHEAL-NOOP-001** — Sign-in with usable stored username does NOT call repair.
   - [UI] no network blip
   - [Code] hook short-circuits; no edge-fn invocation
   - [DB] no audit row

7. **DISCORD-SELFHEAL-PRESERVES-LINK-001** — Repair never touches `discord_user_id` or `has_discord_account`.
   - [UI] Verified badge stays
   - [Code] update payload contains only `discord_username`
   - [DB] `discord_user_id` and `has_discord_account` byte-equal before/after

8. **DISCORD-SELFHEAL-DISCORD-DOWN-001** — Repair edge fn handles Discord 5xx via circuit breaker without erroring the user.
   - [UI] silent — label stays `Connected to Discord`
   - [Code] returns 503; client swallows; no retry storm
   - [DB] no profile update; `external_api_recovered` will fire on next probe per Lane-2 logging memory

9. **DISCORD-BACKFILL-ADMIN-001** — Admin clicks "Repair Discord usernames"; all legacy rows are repaired without breaking any link.
   - [UI] toast `Repaired N members` with counts
   - [Code] only `discord_username` updated; rows where Discord still returns dot-leading are skipped as legit
   - [DB] every previously linked member retains their `discord_user_id`; 0 rows lose `has_discord_account=true`

10. **DISCORD-BACKFILL-FORBIDDEN-001** — Non-admin call to backfill is rejected.
    - [UI] 403 toast
    - [Code] edge fn checks `has_role(uid, 'admin')` before any work
    - [DB] no writes, no `audit_log` row beyond the rejection event

11. **DISCORD-DB-TRIGGER-REJECTS-EMPTY-001** — Direct DB update setting `discord_username=''` while `discord_user_id` is set is rejected.
    - [UI] N/A
    - [Code] update via service role raises exception
    - [DB] row unchanged

12. **DISCORD-DB-TRIGGER-IGNORES-UNLINKED-001** — Empty `discord_username` allowed when `discord_user_id` is NULL/empty.
    - [UI] N/A
    - [Code] update succeeds
    - [DB] row updated

13. **DISCORD-MIGRATION-PRESERVES-LINKS-001** — Migration's data-sanitization step never clears `discord_user_id` or `has_discord_account`.
    - [UI] every previously verified member still shows the Verified badge
    - [Code] migration sets `discord_username=NULL` only; no other columns in `UPDATE` SET
    - [DB] pre/post counts of `discord_user_id IS NOT NULL` are identical; pre/post counts of `has_discord_account=true` are identical

14. **DISCORD-NORMALIZE-INPUT-001** — Search input normalizer never prepends `.`.
    - [UI] typing `alice` searches for `alice`, not `.alice`
    - [Code] `normalizeDiscordSearchInput('alice') === 'alice'`, `normalizeDiscordSearchInput('@alice') === 'alice'`, `normalizeDiscordSearchInput('') === ''`
    - [DB] N/A

## Files touched

- `src/lib/discord/username.ts` (new)
- `src/components/profile/ProfileDiscordConnector.tsx` (display guard + remove dot-prepend)
- `src/pages/ConnectDiscordPage.tsx` (display guard + remove dot-prepend)
- `src/components/SelfHealingRunner.tsx` + new `src/hooks/use-discord-username-repair.ts`
- `supabase/functions/resolve-discord-id/index.ts` (write-time guard)
- `supabase/functions/repair-discord-username/index.ts` (new)
- `supabase/functions/backfill-discord-usernames/index.ts` (new)
- `src/pages/SystemHealthPage.tsx` (Discord tab gets "Repair Discord usernames" button)
- Migration: `validate_discord_username` trigger + one-time data sanitization
- `bdd_scenarios` inserts for the 14 scenarios above
- Unit tests: `src/test/lib/discord-username.test.ts`, extend `src/test/ui/ConnectDiscordPage.test.tsx`, `src/test/services/profile.service.test.ts`

## Out of scope

- No change to `profiles.email` immutability or any other PII field.
- No change to `prevent_unverified_discord_change` trigger.
- No Discord OAuth flow change (we stay with the username-search + member-confirm flow).
- No mass re-verification — backfill only normalizes the displayed handle, never the link itself.
