# Fix: infinite spinner on `/admin/roster` (and other guarded routes) when not signed in

## What's happening

Your screenshot shows `/admin/roster` stuck on a spinner with the header in logged-out state ("Connect" button visible). Other members likely hit the same thing whenever their session ends (idle timeout, manual sign-out, token revocation, expired refresh token) and then they land on or refresh any guarded route.

## Root cause

`AuthContext` only flips `profileLoaded` to `true` inside `fetchProfile`'s `finally` block — which only runs when there *is* a user to fetch a profile for.

In every "no user" path it explicitly does the opposite:

- Initial `getSession()` returns no session → `setProfileLoaded(false)` (line 269)
- `getSession()` rejects → `setProfileLoaded(false)` (line 280)
- Auth event with `session?.user == null` (SIGNED_OUT, expired token) → `setProfileLoaded(false)` (line 251)
- Manual `signOut` / `signOutAllDevices` → `setProfileLoaded(false)` (lines 292, 300)

`AdminRoute` then renders its spinner forever because the gate is:

```ts
if (authLoading || adminLoading || !profileLoaded || (isAdmin && mfaState === null))
  return <Spinner />;
if (!user) return <Navigate to="/login" />;
```

`profileLoaded` is stuck at `false`, so the `Navigate` to `/login` is never reached. Same trap exists in `TeacherRoute`, `ProjectApplicationPage`, `ConnectDiscordPage`, etc.

## The fix (one line of intent, four call sites)

When there is no user, there is no profile to wait on — `profileLoaded` should be `true`. Change the four "no user" branches in `src/contexts/AuthContext.tsx` to call `setProfileLoaded(true)` instead of `false`:

- Auth state change with null user (line 251)
- Initial `getSession()` resolved with no session (line 269)
- Initial `getSession()` rejected (line 280)
- `signOut` and `signOutAllDevices` (lines 292, 300) — set to `true` so a follow-up navigation to a guarded route resolves immediately to `/login` instead of spinning

`fetchProfile` still owns the `true → after fetch` transition for the signed-in path, so no behavior changes for authenticated users.

## Why guards are correct as-is

Guards using `profileLoaded` are checking "is the auth picture fully settled?", which for a signed-out user is "yes, settled, no profile". No guard needs to change.

## Verification

1. Reproduce: open `/admin/roster` in a logged-out tab → currently infinite spinner; after fix, immediate redirect to `/login?from=/admin/roster`.
2. Sign in as admin, hit `/admin/roster` → still loads normally (profileLoaded transitions via `fetchProfile`).
3. While signed in on `/dashboard`, click sign out → redirect to landing, no stuck spinner.
4. Force-expire the refresh token (clear `sb-*` from localStorage) and reload `/admin/roster` → redirect to `/login`, no spinner.
5. Unit test in `src/test/ui/AdminRoute.test.tsx` already covers `user: null, profileLoaded: true` → asserts redirect. Add one for the previously-broken case `user: null, profileLoaded: false (now true after fix)`.

## BDD

Add `PERF-CWV-017` / `AUTH-GUARD-001` to `bdd_scenarios` with tri-layer assertions: [UI] no spinner > 1s on guarded route when signed out, [Code] `profileLoaded === true` when `user === null`, [DB] no `web_vital_samples.lcp` over 2.5s recorded for this state.

## Files touched

```text
src/contexts/AuthContext.tsx          — flip 4 setProfileLoaded(false) → setProfileLoaded(true) in no-user branches
src/test/ui/AdminRoute.test.tsx       — add regression test for signed-out + profileLoaded flip
supabase/migrations/<ts>_bdd.sql      — AUTH-GUARD-001 scenario row
```
