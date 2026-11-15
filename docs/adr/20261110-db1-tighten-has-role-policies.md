# ADR 20261110 — DB-1 burndown batch 4: tighten implicit-PUBLIC has_role RLS policies to authenticated

- Status: accepted
- Date: 2026-11-10
- Deciders: repo owner (mdenner), in session
- Relates to: ADR 20261110-db1-anon-definer-completeness (the gate + inventory), batches 1
  (20261110-db1-revoke-trigger-functions), 2 (20261110-db1-revoke-rpc-admin-mutations), and 3
  (20261110-db1-revoke-rls-helper-functions), ADR-0026 (expand/contract), ADR-0024 (prove at the owning
  layer), ADR-0036 (db push ≠ atomic with code deploy), ADR-0056 (least-privilege grants on public tables).

## Context

Batches 1–3 took the anon-exposed SECURITY DEFINER inventory 76 → 30. Batch 4 was planned as "revoke
anon EXECUTE on `has_role(uuid, app_role)`" — the admin authz helper, and the single highest-blast-radius
remaining item. Batch 3 deliberately deferred it pending a dedicated anon-policy audit.

That audit (all 367 policy-touching migrations in chronological order, per-statement CREATE/DROP POLICY
lifecycle, cross-checked three ways, then verified by hand on all findings) returned **NOT SAFE to revoke**.
**9 live RLS policies call `has_role` in their USING/WITH CHECK and have NO `TO` clause** — which in Postgres
defaults a policy to the PUBLIC role group, so `anon` is in scope:

| Table | Policy | Cmd |
|---|---|---|
| policy_versions | policy_versions admin write | ALL |
| policy_acknowledgments | ack self read | SELECT |
| recording_consents | rec self read | SELECT |
| sanctions_screenings | sanctions admin read | SELECT |
| dispute_intake | dispute admin read | SELECT |
| dispute_intake | dispute admin update | UPDATE |
| dpa_executions | dpa admin all | ALL |
| observer_role_optins | Admins can view all observer opt-ins | SELECT |
| lesson_video_events | lve self or admin read | SELECT |

**The specific risk.** An RLS policy's USING/WITH CHECK expression is evaluated as the *querying* role
(SECURITY DEFINER changes execution context only AFTER invocation, not the right to invoke). So revoking
anon's EXECUTE on `has_role` would turn an anon query against any of these tables into `permission denied for
function has_role`. `policy_versions` is anon-reachable in practice: it also has a `readable by all`
(`USING(true)`, PUBLIC) SELECT policy, so a logged-out visitor's SELECT evaluates both permissive policies
and reaches `has_role`. Revoking would also (correctly) trip batch 3's self-check #2.

The audit also cleared the transitive vector: the only SECURITY INVOKER function calling `has_role`
(`get_top_error_fingerprints`) already has anon revoked and is in no policy; the other 67 callers are
SECURITY DEFINER (nested call runs as owner — safe). storage.objects `has_role` policies are all
`TO authenticated`.

So the revoke cannot happen first. Its prerequisite — removing anon from the scope of these 9 policies —
is this batch.

## Decision

Tighten all 9 policies from implicit-PUBLIC to `TO authenticated` via `ALTER POLICY ... TO authenticated`
(migration `20261111000000`), which changes only the applicable roles and preserves each USING/WITH CHECK
expression verbatim. The anon-revoke on `has_role` itself becomes a **later batch**, after this is applied
and verified (expand/contract: tighten the policies first, revoke the function later).

**Why behavior-preserving (and therefore expand/contract-safe).** These are admin-only or self-or-admin
checks. For an anon caller `auth.uid()` is NULL, so `user_id = auth.uid()` is false and
`has_role(NULL, 'admin')` is false — anon already matches **no** rows through any of these 9 permissive
policies today. Moving them to `TO authenticated` removes anon from scope: anon then has no applicable
policy for that command → default-deny → still no rows. Same observable result for anon, minus the
`has_role` evaluation. `authenticated` keeps the identical policy and its direct grant on `has_role`, so
admins/self see exactly what they see now. `policy_versions`' separate `readable by all` policy is untouched,
so anon still reads policy versions. Anon writes to these tables go through SECURITY DEFINER RPCs
(`record_policy_ack`, `record_sanctions_screening`, `submit_dispute`), not direct table access, so no app or
edge path relies on anon-scope of these 9. Safe to apply before/after any deploy, safe to leave if code
rolls back (ADR-0036).

**Two fail-closed self-checks, both run at prod `db push`:**
1. **Targeted invariant** — the apply step aborts on name/signature drift (a missing expected policy
   aborts there), and this self-check then asserts none of the 9 named policies still applies to
   anon/public after the ALTER.
2. **General invariant (load-bearing)** — assert **no** `pg_policies` row whose roles include anon/public
   references `has_role` anywhere. Reads prod's live catalog at apply, so a hidden/dashboard-defined anon
   policy referencing `has_role` aborts the migration. After this migration succeeds, this invariant holds:
   `has_role` is then safe to revoke from anon (the next batch).

A pgTAP guard (`supabase/tests/has_role_no_anon_policy_test.sql`) locks the same general invariant in the
`db-test` suite so a regression (a new no-`TO`-clause or `TO anon`/`TO public` policy that calls `has_role`)
is caught.

## Alternatives considered

- **Revoke anon on `has_role` now.** Rejected — it breaks 9 live anon-applicable policies; proven by the
  audit and by batch 3's own guard. This batch is its prerequisite.
- **DROP + re-CREATE each policy `TO authenticated`.** Rejected — `ALTER POLICY ... TO` is smaller and
  atomic, and preserves the USING/WITH CHECK expression verbatim (no risk of mistyping a compliance-table
  predicate).
- **Lock these policies to admins only / rewrite the predicates.** Rejected — out of scope and not
  behavior-preserving; this batch only removes anon from scope, nothing else.
- **Leave as-is and just document "keep has_role".** Rejected — leaves a latent footgun (implicit-PUBLIC
  policies on compliance tables) and permanently blocks the has_role anon-revoke.

## Consequences

- 9 RLS policies no longer apply to anon/public; `authenticated`/admin/self behavior unchanged, anon
  behavior unchanged (still no rows; `policy_versions` still readable via its separate policy). No grant is
  changed in this batch; the DB-1 grandfather count is unchanged (30) — `has_role` stays grandfathered until
  its own revoke batch.
- **Unblocks the has_role anon-revoke (batch 5):** after this applies, no anon/public policy references
  `has_role` *directly*, so `REVOKE EXECUTE ... FROM anon, PUBLIC` on `has_role` is safe. That batch should
  carry the same live-catalog self-check and remove `has_role` from the grandfather. It must ALSO close the
  transitive gap below: scan `pg_proc.prosrc` of SECURITY INVOKER functions and `security_invoker` views
  for `has_role`, because an anon/public policy could reach `has_role` indirectly (through such a function or
  view) without the token appearing in the policy's own `qual`/`with_check`.
- **Prod impact:** applied by the migration pipeline on merge. Reversible-forward by a later
  `ALTER POLICY ... TO public`; idempotent (guarded existence check; ALTER is a no-op if already
  authenticated; self-checks read-only). If prod has a hidden anon/public policy referencing `has_role` that
  the repo doesn't show, self-check #2 fails the apply (fail-fast) — the intended safe outcome.
- **Limitation (honest):** Postgres could not be run locally. The policy-reference analysis is `observed`
  from migration history and verified by hand on all 9; the invariant is proven at apply by the two
  in-migration self-checks (which read the live catalog) and locked in CI by the pgTAP guard. The pgTAP
  `db-test` suite is currently **informational** (not a required check), so the ledger could regress without
  blocking a merge; the **load-bearing** guard is self-check #2, which runs at the actual prod `db push`.
  Promoting `db-test` to blocking is tracked separately (RP-H TST-3). Both self-check #2 and the pgTAP
  guard match `has_role` by name in a policy's own `qual`/`with_check` text, so they do **not** catch a
  policy that reaches `has_role` *transitively* via a SECURITY INVOKER function or `security_invoker` view
  (the token is not in the policy text). The current transitive vector is clear (the only SECURITY INVOKER
  caller, `get_top_error_fingerprints`, already has anon revoked and is in no policy), so this is not a
  batch-4 defect — but batch 5's pre-revoke check must close it (see Consequences).
