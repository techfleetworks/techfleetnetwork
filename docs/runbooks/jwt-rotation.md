# Runbook — JWT Signing-Key Rotation

**Cadence:** every 90 days, or immediately on suspected leak.

## Steps

1. In Supabase dashboard → Settings → API → "Rotate JWT Secret".
2. Update Vault entries that re-sign tokens (none today — Supabase handles it).
3. Force sign-out for all sessions:
   ```sql
   INSERT INTO public.revoked_sessions (user_id, reason)
   SELECT id, 'jwt_rotation' FROM auth.users;
   ```
4. Notify users via in-app banner ("Please sign in again — security maintenance").
5. Update `docs/runbooks/jwt-rotation.md` with the rotation date below.

## Rotation history

| Date | Operator | Reason |
|---|---|---|
| _initial_ | — | Project setup |
