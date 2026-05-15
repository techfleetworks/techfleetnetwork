# Fix project blast 500 error

## Root cause

In `supabase/functions/send-project-blast/index.ts` (step 6, lines 148–163) the recipients query is:

```ts
.from('project_applications')
.select('user_id, email, profiles!project_applications_user_id_fkey(first_name, email)')
```

But `project_applications` has **no `email` column** and **no foreign key named `project_applications_user_id_fkey`** (the only FK is `project_id_fkey` to `projects`). PostgREST rejects this select, the function throws, and returns a 500 — before any `project_blasts` row is inserted. This matches what we see:

- Edge logs: `POST /send-project-blast → 500` (2475ms), no function-level log lines.
- DB: zero rows in `project_blasts` ever.
- No `project_blast.denied` audit row, so failure is past the admin/coordinator checks but inside the recipients lookup.

## Fix

Rewrite step 6 to fetch user_ids from `project_applications`, then bulk-load names + emails from `profiles` by id (no embedded join, no nonexistent column).

```ts
// 6. Recipients (status = completed)
const { data: applicants, error: appErr } = await admin
  .from('project_applications')
  .select('user_id')
  .eq('project_id', projectId)
  .eq('status', 'completed')
if (appErr) return json({ error: 'Recipient lookup failed', detail: appErr.message }, 500)

const userIds = Array.from(
  new Set((applicants ?? []).map((r: any) => r.user_id).filter(Boolean))
) as string[]
if (userIds.length === 0) return json({ error: 'No applicants to email' }, 400)
if (userIds.length > MAX_RECIPIENTS) return json({ error: 'Recipient cap exceeded' }, 400)

const { data: profiles, error: profErr } = await admin
  .from('profiles')
  .select('id, email, first_name')
  .in('id', userIds)
if (profErr) return json({ error: 'Profile lookup failed', detail: profErr.message }, 500)

const recipients = (profiles ?? [])
  .map((p: any) => ({
    user_id: p.id as string,
    email: ((p.email ?? '') as string).trim().toLowerCase(),
    firstName: (p.first_name ?? '') as string,
  }))
  .filter((r) => r.email)

if (recipients.length === 0) return json({ error: 'No applicants with valid email' }, 400)
```

Everything downstream (`processOne`, blast row insert, audit log) already uses `recipients[].user_id / email / firstName`, so no other changes needed.

## Defense-in-depth (small, included)

- Wrap the whole handler body after CORS/method check in `try/catch` that returns `json({ error: 'Internal error', detail: e.message }, 500)` and emits a `reportError`-style audit row, so any future PostgREST shape mismatch surfaces in System Health instead of being a silent 500.
- Add one BDD scenario `BLAST-FIX-001` covering "completed applicants without an email column on project_applications still receive the blast".

## Files touched

- `supabase/functions/send-project-blast/index.ts` — recipients query rewrite + outer try/catch.
- New migration: insert `BLAST-FIX-001` BDD scenario row.

No frontend, schema, or RLS changes required.
