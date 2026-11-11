# ADR 20261111 — DB-1 burndown batch 6: revoke anon EXECUTE on ops/monitoring + missed-trigger functions

- Status: accepted
- Date: 2026-11-11
- Deciders: repo owner (mdenner), in session
- Relates to: ADR 20261110-db1-anon-definer-completeness (the gate + inventory), batches 1–5
  (20261110-db1-revoke-trigger-functions, -revoke-rpc-admin-mutations, -revoke-rls-helper-functions,
  -tighten-has-role-policies, -revoke-has-role), ADR-0026 (expand/contract), ADR-0024 (prove at the owning
  layer), ADR-0036 (db push ≠ atomic with code deploy).

## Context

Batches 1–5 took the anon-exposed `public` SECURITY DEFINER inventory 76 → 29. Of the remaining 29, only 6
are candidates to burn down; the other 23 are intentional public RPCs (anon legitimately calls them) or out
of scope (auth/rate-limit/provisioning, owned by the auth refactor; stats/KPI). This batch clears those 6:

| Function | Real caller(s) | In anon/public policy? |
|---|---|---|
| `get_stuck_pending_email_count(integer)` | admin System Health card, rpc as authenticated | no |
| `community_events_staleness_check()` | pg_cron every 15 min (runs as owner) | no |
| `fill_content_gaps_check_and_inc(integer)` | service_role worker only | no |
| `class_item_release(uuid, uuid)` | nested in `get_class_curriculum_for_learner` (as owner) + RLS policies, all `TO authenticated` | no |
| `get_class_curriculum_for_learner(uuid)` | learner/editor view rpc as authenticated (raises `auth_required` when `auth.uid()` is NULL) | no |
| `trg_general_app_submitted()` | AFTER INSERT/UPDATE trigger on `general_applications`; never RPC | no |

All are anon-exposed only through the residual *direct* default-privilege grant to `anon` (the batch-1
mechanism); `REVOKE … FROM PUBLIC` alone does not remove it. A per-caller analysis (edge functions, frontend
`.rpc`, pg_cron, RLS policies, nested DB calls) found **no** legitimate anon path for any of the 6.

## Decision

`REVOKE EXECUTE … FROM anon, PUBLIC` on all 6 (migration `20261111020000`), and remove them from the
completeness grandfather (29 → 23).

**Why safe (per function).** `get_stuck_pending_email_count`, `class_item_release`,
`get_class_curriculum_for_learner` keep their own direct grants to `authenticated` (+`service_role`);
`fill_content_gaps_check_and_inc` keeps `service_role`; `community_events_staleness_check` is called only by
pg_cron, which runs as the job owner (no caller-role grant needed); `trg_general_app_submitted` is a trigger
function that fires in the table owner's context, so its EXECUTE grant is irrelevant to firing (it was the
one trigger missed by batch 1). `class_item_release` is the only one referenced by RLS policies, and every
referencing policy is `TO authenticated` — so revoking anon cannot turn an anon table read into
`permission denied for function`.

**Two fail-closed self-checks, both run at prod `db push`:**
1. **Caller preservation** — assert each real caller role (`authenticated`/`service_role`, per the table)
   still holds EXECUTE; abort on a lost grant or on signature drift. (The REVOKE statements themselves also
   abort the apply if a signature does not exist, so drift cannot pass silently.)
2. **Anon-RLS safety (load-bearing)** — assert **no** `pg_policies` row whose roles include anon/public
   references any of the 6 function names, reading the live catalog at apply, so a hidden/dashboard anon
   policy aborts the migration. The match is on a word boundary (`~* '\m<fn>\M'`), per the batch-5 lesson
   (a bare-substring match wrongly caught the built-in `pg_has_role`).

## Alternatives considered

- **Also revoke `authenticated` where no app path needs it (e.g. `community_events_staleness_check`).**
  Rejected — out of scope for RP-I (anon exposure); tightening `authenticated` is a separate concern and
  this batch stays minimal (smallest change).
- **Leave `community_events_staleness_check` / `trg_general_app_submitted` (no caller-role to assert).**
  Rejected — they are anon-exposed and have no anon need; revoking is caller-safe (cron/owner, trigger).
- **`REVOKE FROM anon` only (not PUBLIC).** Rejected — consistent with batches 1–5, `, PUBLIC` guarantees
  removal; self-check #1 covers the side-effect on the real caller roles.
- **Add batch 5's transitive self-check (#3: anon-reachable SECURITY INVOKER functions / `security_invoker`
  views that call the target).** Omitted here as verified moot: no SECURITY INVOKER function and no
  `security_invoker` view references any of these 6, and every nested caller (e.g. `class_item_release` inside
  `get_class_curriculum_for_learner`, `can_read_class_module_file`) is SECURITY DEFINER, so the nested call
  runs as the owner, never as anon. That check was essential for `has_role` (called across the codebase); for
  these 6 it would be speculative. Self-check #2 (direct anon/public policy references) is retained.

## Consequences

- 6 functions no longer anon-executable; real callers unaffected. DB-1 backlog 29 → 23, and the
  **burn-down is now complete** — the remaining 23 are intentional public RPCs or out-of-scope
  (auth/stats). The completeness gate continues to catch any NEW anon-exposed SECURITY DEFINER function.
- **Prod impact:** applied by the migration pipeline on merge, then at the actual prod `db push`. Safe for
  expand/contract (no live caller loses access — proven by self-check #1); reversible by re-`GRANT`;
  idempotent. If prod has an anon/public policy referencing one of the 6, self-check #2 fails the apply
  (fail-fast).
- **Limitation (honest):** Postgres could not be run locally — anon removal is proven by the CI `db-test`
  completeness run (grandfather 29 → 23) and caller/anon-RLS safety by the two in-migration self-checks
  (which also run at prod apply). Caller analysis is `observed` from migration + app source, `inferred` for
  prod. `fill_content_gaps_check_and_inc` has no live caller found at all (only `service_role` granted); if a
  future caller is added it must use the service-role key.
- **Gate strength (honest):** the `db-test` completeness suite is currently **informational** (RP-H TST-3
  tracks promoting it to blocking). The load-bearing anon guards here run at the actual prod `db push`.
