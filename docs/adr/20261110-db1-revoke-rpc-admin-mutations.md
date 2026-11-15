# ADR 20261110 — DB-1 burndown batch 2: revoke anon EXECUTE on rpc-callable admin mutations

- Status: accepted
- Date: 2026-11-10
- Deciders: repo owner (mdenner), in session
- Relates to: ADR 20261110-db1-anon-definer-completeness (the gate + the 76-function inventory),
  ADR 20261110-db1-revoke-trigger-functions (batch 1), ADR-0026 (expand/contract), ADR-0024 (prove at the
  owning layer). Owner's scope calls this session: auth/rate-limit/signup bucket → auth agent; stats/KPI out
  of scope; borderline account bucket (community-agreement, discord, policy) in scope.

## Context

The DB-1 completeness gate recorded **76** `public` SECURITY DEFINER functions `anon` can EXECUTE by
default. Batch 1 revoked the 18 **trigger** functions (caller-safe — a trigger function needs no direct
EXECUTE), leaving **58**. This batch handles the next tranche: the **rpc-callable** mutations — functions a
real role invokes through PostgREST. Unlike triggers, these need per-caller analysis before a revoke, to
prove (a) `anon` is never a legitimate caller, and (b) the role that IS the caller keeps EXECUTE.

**The batch-2 risk batch 1 did not have.** From batch 1 we know `anon` holds a *direct* role grant (the
Supabase default privilege grants EXECUTE directly to `anon`, `authenticated`, and `service_role`, plus to
PUBLIC). Removing `anon` requires `REVOKE … FROM anon, PUBLIC` (drop the direct anon grant **and** the PUBLIC
path). But `, PUBLIC` also removes PUBLIC access for `authenticated`/`service_role` — which is only harmless
*if* those roles hold their own direct grant. The completeness test asserts the **anon dimension only**, so
a `, PUBLIC` that stripped a legitimate caller would leave the test green while breaking a real RPC in prod.

## Decision

Revoke EXECUTE `FROM anon, PUBLIC` on **20** rpc-callable mutations (migration `20261110220000`), classified
by per-caller evidence (`observed`, 2026-11-10, on this branch):

- **Authenticated callers (15)** — the class-curriculum admin CRUD (`upsert_class_section`,
  `delete_class_section`, `upsert_class_module_item`, `delete_class_module_item`, `reorder_class_sections`,
  `reorder_class_module_items`, `publish_class_curriculum`, `toggle_class_module_completion`,
  `set_class_release_policy`, `upsert_class_module_link`, `register_class_module_file`,
  `delete_class_module_attachment`), called from `src/features/class-curriculum/services/
  classCurriculum.service.ts` as the logged-in class-editor; plus `sign_community_agreement`
  (`CommunityAgreementSheet.tsx`), `publish_policy_version` (`AdminPoliciesPage.tsx`),
  `mark_task_incomplete` (`journey.service.ts`). None reachable by anon.
- **Service-role callers (4)** — `resolve_gumroad_user` (gumroad edges),
  `list_founding_discord_role_targets`, `report_founding_discord_role_gap` (founding-discord-role edge),
  `mark_community_agreement_required` (applicant-status / community-agreement-trigger edges). Called with
  the service-role client; never by anon.
- **Both authenticated and service_role (1)** — `attach_gumroad_sale`. The gumroad edges call it as
  service_role, AND it is intentionally **member-admin-callable** as `authenticated`: granted `TO
  authenticated, service_role` (`20260803120000_membership_ledger_projection.sql:483`), called "the
  intentionally member-callable surface" (`20260810110000_lockdown_membership_internal_functions.sql`),
  and `membership_ledger_test.sql` proves an authenticated non-admin gets `42501` (so it runs under
  `authenticated`, an admin passes) — the per-sale admin fallback of ADR-0038. Never by anon. The
  self-check asserts BOTH roles retain EXECUTE for it.

(Accuracy note for the 15 authenticated fns: most are also granted `service_role`; the self-check asserts
`authenticated` — the role whose loss would break the interactive caller — which is sufficient and safe.)

**Self-proving, fail-closed.** The migration ends with a `DO` block that resolves each of the 20 signatures
and asserts the intended role (`authenticated` or `service_role`) still holds EXECUTE; it `RAISE EXCEPTION`s
(rolling back the whole migration) if any role lost EXECUTE or any signature failed to resolve. This closes
the gap the completeness test can't see: a wrong role attribution or an unexpected grant topology **aborts
the prod apply** instead of silently breaking a caller. The `db-test` completeness assertion separately
proves on CI that each is no longer anon-exposed (grandfather shrinks 58 → 38).

Explicitly **excluded** (stay in the grandfather, 38 remaining):
- **SECURITY DEFINER RLS helpers** (`has_role`, `is_class_learner`, `is_class_owner`, `is_enrolled_in_class`,
  `_assert_class_editor`, `_learner_cohort_start`, `can_read_class_module_file`, `can_write_class_module_file`,
  `handoff_is_active_member`) — revoking anon EXECUTE could turn an anon table-read whose RLS policy *calls*
  one of these into a hard `permission denied for function` error. Deferred until a batch first proves no
  anon-visible table's policy references them.
- **Auth / sign-in / rate-limit / signup-provisioning** (`check_rate_limit`, `peek_rate_limit`,
  `record_rate_limit_failure`, `chunk_stale_log_rate_limit`, `record_failed_login`, `record_login_event`,
  `use_invitation`, `record_event` — the last is on the anon login-telemetry path — and the provisioning
  triggers `trg_fn_profiles_provision_customer`, `trg_fn_user_roles_provision_admin`) — owned by the auth refactor.
- **Stats/KPI/health** (`admin_recompute_stats`, `_upsert_kpi`, `membership_health`) — out of scope.
- **Intentional public RPCs anon legitimately calls** — `get_feature_flags`, `get_i18n_bundle`,
  `get_network_stats`, `get_member_continent_distribution`, `get_member_country_distribution`,
  `get_course_completion_counts`, `get_welcome_flow_completion_count`, `get_current_policy`,
  `record_policy_ack`, `validate_invitation` — stay granted to anon.
- **Ops/monitoring + misc** (`get_stuck_pending_email_count`, `community_events_staleness_check`,
  `fill_content_gaps_check_and_inc`, `class_item_release`, `get_class_curriculum_for_learner`) and the missed
  trigger `trg_general_app_submitted` — later batches.

## Alternatives considered

- **`REVOKE FROM anon` only (not PUBLIC).** Rejected — if a function's anon access is via the PUBLIC grant
  rather than (or in addition to) the direct grant, `FROM anon` alone leaves it anon-exposed; the completeness
  test would then red. `, PUBLIC` guarantees removal; the self-check covers its side-effect.
- **`REVOKE FROM anon, PUBLIC` with no self-check.** Rejected — a wrong role attribution or a function
  lacking a direct grant for its caller would break a real RPC in prod while the anon-only completeness test
  stayed green. The self-check makes that failure loud and pre-merge.
- **Add a separate pgTAP "caller retained" test instead of an in-migration check.** Rejected as the primary
  guard — a test proves it in CI, but the in-migration `DO` block also protects the actual prod `db push`
  (aborts the transaction), which a test file cannot. (A CI pgTAP for the positive dimension is a reasonable
  future addition; the self-check is the load-bearing protection now.)

## Consequences

- 20 rpc-callable mutations no longer anon-executable; `authenticated`/`service_role` unaffected (proven by
  the self-check). DB-1 backlog drops 58 → 38, tracked by the gate.
- **Prod impact:** applied by the migration pipeline on merge. No running code path breaks (legitimate
  callers keep EXECUTE; anon never called these), so it is safe for expand/contract (ADR-0026). Reversible by
  re-`GRANT`; idempotent (re-revoke is a no-op; the self-check is read-only).
- **Limitation (honest):** I could not run pgTAP/Supabase locally — anon removal is proven by the CI
  `db-test` run (grandfather shrank 58 → 38 + completeness assertion green) and caller preservation by the
  in-migration self-check (which runs at both CI `db-test` and prod apply). The per-caller role attribution
  is `observed` from the call sites (frontend browser client ⇒ `authenticated`; edge service-role client ⇒
  `service_role`); a caller that invoked one of these through a different role than observed is the residual
  risk, and the self-check narrows it to "a role I named still has access," not "every possible caller." The
  RLS-helper and ops tranches are deliberately deferred, not forgotten (listed in the grandfather note).
