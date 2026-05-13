# Fix: admin realtime leak on system_health_state & system_remediations

## Problem
Both tables are in the `supabase_realtime` publication. Postgres-level RLS protects direct reads, but Realtime broadcasts row payloads to any authenticated subscriber of the channel. This leaks operational state, remediation rules, error patterns, and cooldowns.

## Approach
Keep realtime working for admins (the hook drives the System Health UI) and block everyone else by adding RLS on `realtime.messages` scoped to `has_role(auth.uid(), 'admin')`.

## Migration
1. Ensure RLS is enabled on `realtime.messages` (it is by default in modern Supabase, but assert).
2. Add policy `"Admins read system-health realtime"` on `realtime.messages` for `SELECT` to `authenticated`, `USING (has_role(auth.uid(), 'admin') AND topic IN ('system-health-live'))`.
   - The hook subscribes on channel/topic `system-health-live`; non-admin subscribers will receive nothing.
3. Leave both tables in the publication (admins still need live updates).
4. No client code changes — `useSystemHealthRealtime` is already only mounted from admin-gated System Health views.

## Verification
- Linter rerun: finding `realtime_system_tables_no_channel_authz` clears.
- Manual: signed-in non-admin opening a console subscription to `system-health-live` receives zero payloads; admin still sees invalidations.
- Mark finding fixed via `security--manage_security_finding`.

## BDD seed (bdd_scenarios)
`SEC-RT-001` — Given a non-admin authenticated session, When they subscribe to `system-health-live`, Then [Code] no postgres_changes payloads arrive, [DB] `realtime.messages` SELECT returns 0 rows for that role, [UI] System Health route remains gated and unreachable.
`SEC-RT-002` — Given an admin session, When a row in `system_health_state` or `system_remediations` changes, Then [Code] the channel callback fires, [DB] policy permits the read, [UI] affected System Health tab refetches without manual reload.
