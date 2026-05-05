## Context

Verified live in the database right now:
- **Zero orphan auth.users** without a profile.
- **Zero orphan profiles/user_roles** without an auth.users.
- The bidirectional triggers added in the previous fix are active:
  - `on_auth_user_deleted` (BEFORE DELETE on auth.users) → cleans every public child table.
  - `trg_cascade_delete_auth_on_profile` (AFTER DELETE on profiles) → deletes the matching auth.users.

So the immediate user-facing bug is gone. What's still fragile is the **application code**, which manually deletes child rows and the profile *before* deleting the auth user. If any of those steps fail mid-flight (network, RLS, table rename), we get exactly the orphan you hit. The triggers save us today, but defense-in-depth says the app shouldn't even try to do work the database is now responsible for.

## Refactor — make auth.users the single delete entrypoint

### 1. `supabase/functions/delete-account/index.ts` (self-serve "Delete my account")

Replace the 6-step manual cascade with a single call:

```ts
// Verify caller (unchanged) ...
const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
if (error) return 500;
return { success: true };
```

The `on_auth_user_deleted` trigger handles every child table atomically inside one DB transaction. No more partial-purge window.

### 2. `supabase/functions/admin-purge-auth-user/index.ts` (admin "ghost account" tool)

- Keep the admin + 2FA gate, email lookup, last-admin guard, audit log, and the **email-keyed** cleanups (`suppressed_emails`, `failed_login_attempts`, `email_unsubscribe_tokens`, `rate_limits`) — those are not tied to a user_id and the trigger can't reach them.
- **Delete** the `tablesByUserId` loop entirely (lines ~114-144). The trigger covers it.
- Order becomes: email-keyed cleanup → `auth.admin.deleteUser(target.id)` → audit.

### 3. Add a guard so a profile can never be created without an auth user

New `BEFORE INSERT` trigger on `public.profiles`:
```sql
IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.user_id) THEN
  RAISE EXCEPTION 'profile.user_id % has no matching auth.users row', NEW.user_id;
END IF;
```
Closes the other direction of the orphan problem.

### 4. Nightly orphan reconciliation (belt + suspenders)

Add `public.reconcile_account_orphans()` SECURITY DEFINER function and a `pg_cron` job (3 AM UTC) that:
- Finds `auth.users` with no `profiles` row → deletes them via `auth.admin` equivalent (`DELETE FROM auth.users` works from a SECURITY DEFINER fn with `auth` in search_path, same pattern the cascade trigger already uses).
- Finds `profiles` with no `auth.users` → deletes them.
- Logs counts to `audit_log` with `event_type='orphan_reconciliation'`.
- Surfaces non-zero counts as a System Health → Triage entry so we see drift the next morning instead of via a user complaint.

### 5. Tests / BDD

Insert into `bdd_scenarios`:
- `ACC-DEL-020` — User self-deletes account → `auth.users` row gone, all child tables empty for that user_id, re-signup with same email succeeds. [UI][DB][Code]
- `ACC-DEL-021` — Admin purges email with orphan auth row → auth row gone, audit entry written. [UI][DB][Code]
- `ACC-DEL-022` — Insert into `profiles` with non-existent `user_id` → trigger raises. [DB]
- `ACC-DEL-023` — `reconcile_account_orphans()` after seeded orphan → orphan removed, audit entry written. [DB][Code]

### 6. Memory

Update `mem://features/account-deletion` to record: "auth.users is the single delete entrypoint; app code must never delete profile-then-auth manually; bidirectional triggers + nightly reconciliation enforce."

## Files touched

- `supabase/functions/delete-account/index.ts` — collapse to single deleteUser call.
- `supabase/functions/admin-purge-auth-user/index.ts` — remove tablesByUserId loop.
- `supabase/migrations/<new>.sql` — profile insert-guard trigger, `reconcile_account_orphans()` function, pg_cron schedule.
- `bdd_scenarios` table — 4 new scenarios (insert).
- `.lovable/memory/features/account-deletion.md` — updated rule.

## What we are NOT doing

- Not touching the existing `on_auth_user_deleted` or `trg_cascade_delete_auth_on_profile` triggers — they're correct.
- Not running another bulk orphan purge — verified zero exist.
- No UX changes; the "Delete my account" double-confirmation flow stays exactly as it is.
