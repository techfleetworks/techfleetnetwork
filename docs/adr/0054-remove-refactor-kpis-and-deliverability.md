# ADR 0054 — Remove "Refactor KPIs" and "Deliverability" from System Health

- Status: Accepted
- Date: 2026-09-21
- Deciders: Morgan Denner
- Epic: System Health / Lovable-era cleanup

## Context

`/admin/system-health` accreted a wide row of tabs during the Lovable era. Two are being
retired by owner decision:

- **Refactor KPIs** — a daily-snapshot dashboard (`RefactorKpisTab`) tracking the audit-log /
  UX overhaul. Backed by: RPCs `get_refactor_kpis` + `run_refactor_kpis_snapshot_now`, the
  snapshot engine `snapshot_refactor_kpis` + helper `_upsert_kpi`, the realtime broadcast
  function/trigger `broadcast_refactor_kpi_change` / `trg_broadcast_refactor_kpi_change`, tables
  `refactor_kpi_catalog` + `refactor_kpi_daily`, and the `snapshot-refactor-kpis-daily` pg_cron
  job (02:30 UTC). The overhaul it tracked has long since landed; the dashboard is now noise.

- **Deliverability** — a tab rendering `EmailBulkThrottleCard`, `EmailDeliverabilityCard`, and
  `EmailDlqPanel`. Backed (uniquely) by RPCs `get_stuck_pending_email_count` +
  `clear_email_lane_cooldown` and the admin manual-replay edge function `replay-dlq-emails`.
  The separate standalone page `/admin/email-deliverability-test`
  (`AdminEmailDeliverabilityTestPage`) is retired in the same change.

The owner chose a **full teardown** (UI + dedicated backend), not merely hiding the tabs.

### What is deliberately kept (shared / core pipeline)

`email_send_state` and `email_domain_health` (written by the live email pipeline, read
elsewhere), the `validate-email-domain` edge function (signup domain validation, and a
CRITICAL_FALLBACK auth function), and `replay-email-dlq` — the **automated 5-minute pg_cron DLQ
drain**, distinct from the removed admin manual `replay-dlq-emails`. `refresh-email-health`
(populates `email_domain_health`) is untouched. The Queues / Delivery / Email v2 / Errors tabs
remain.

## Decision

1. **Frontend:** drop both tabs and the standalone deliverability-test route from
   `SystemHealthPage.tsx` / `App.tsx` / `RouteTitle.tsx`; delete the four now-orphaned components,
   the standalone page, and the two dead `SystemHealthService` methods (`getRefactorKpis`,
   `runRefactorKpisSnapshot`) + their `RefactorKpi` types. Delete the `replay-dlq-emails` edge
   function and unpin it from `config.toml`; regenerate the edge-function manifests.

2. **Backend:** a single **contract** migration
   (`20260921120000_remove_refactor_kpis_and_deliverability_backend.sql`) drops the KPI tables,
   functions, trigger and cron plus the two Deliverability-only RPCs. Idempotent
   (`DROP … IF EXISTS`, guarded cron), forward-only.

3. **Rollout ordering (db push is NOT atomic with the Cloudflare Pages deploy):** merge → Pages
   ships the tab removal → confirm the tabs are gone → **then** hand-apply the migration via
   `supabase db push`. Applying it early only 404s an already-removed UI surface; it can never
   strand a live one. After apply, regenerate `src/integrations/supabase/types.ts` (it still
   lists the dropped RPCs/tables because it mirrors current prod, which retains them until apply).

4. **Schema-reconciliation gate (ADR-0036):** the derived-object floors in
   `check-db-schema-present.mjs` are re-pinned down for the five categories this teardown reduces
   — `function` 425→418, `column` 2060→2039, `table` 204→202, `rls_enabled` 204→202,
   `trigger` 198→197 — a reviewed, deliberate drop per the gate's own contract.

## Consequences

- **Good:** removes a large, dead Lovable-era surface end-to-end; no half-state (the derived-state
  gate treats prod's retained-until-apply objects as harmless extras, and filters the dropped
  tables' policies once applied).
- **Operational impact:** the **manual** admin DLQ replay button is gone. The **automated**
  `replay-email-dlq` drain still reprocesses dead-lettered mail every 5 minutes, so nothing
  silently stops flowing — only the manual override UI is retired, which is the intent of removing
  the tab. Historical `refactor_kpi_daily` snapshots are discarded (not archived); they measured a
  completed overhaul and have no downstream reader.
- **Reversible-forward:** re-adding either feature would be a normal expand migration + UI; nothing
  here blocks that.
- **Cost:** touches a hardened schema gate; floors are re-pinned in the same PR and validated with
  `DB_SCHEMA_EXTRACT_ONLY=1`.

## Proof

- `DB_SCHEMA_EXTRACT_ONLY=1 node scripts/ci/check-db-schema-present.mjs` after the migration
  reports the exact expected drops (function 418, column 2039, table 202, rls_enabled 202,
  trigger 197); floors updated to match.
- Edge-function manifest regenerated (`check-edge-function-coverage.mjs` → 129 functions, all
  pinned, `replay-dlq-emails` gone).
- `SystemHealthPage.test.tsx` (Delivery + Errors tabs, both kept) stays green; smoke tests that
  hardcoded the `replay-dlq-emails` path (`cors-shared-owner`, `edge-stack-trace-exposure`,
  `notification-xss`, `edge-audit-wrapper-coverage`) updated; tests coupled to the deleted page /
  card (`admin-deliverability-templates`, `email-domain-health-shape`) removed.
- Architecture gate (`npm run check:architecture`) green; `judge-arch` PASS.
