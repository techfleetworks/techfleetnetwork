# Keep Network Stats Accurate Over Time

## Current state
`get_network_stats()` already encodes the formulas you asked for, but the Airtable numbers (890, 1101, 1881) are hard-coded constants. If Airtable totals change, the platform numbers drift until someone edits SQL.

## Goal
Same formulas, but the Airtable inputs (general apps total, Service/Servant Leadership unique registrants, total masterclass registrations) live in a table that auto-refreshes from Airtable on a schedule. The math is stored as an equation, so platform-side counts always add on top.

## Plan

1. **Create `network_stats_baselines` table** — single-row config holding the three Airtable inputs plus `last_synced_at`. Admin-readable; updated only by service role / edge function. Seed with current values: `airtable_general_apps = 890`, `airtable_service_leadership_unique = 1101`, `airtable_masterclass_total = 1881`.

2. **Rewrite `get_network_stats()` to read from that table** as equations:
   - `applications_completed = platform_general_applications + airtable_general_apps`
   - `beginner_courses_active = airtable_service_leadership_unique` (1101)
   - `advanced_courses_active = airtable_masterclass_total - airtable_service_leadership_unique` (1881 − 1101 = 780)
   - `badges_earned = core_completed + platform_general_applications + airtable_general_apps`
   No more magic numbers in the function body.

3. **Edge function `sync-airtable-network-stats`** — queries Airtable for:
   - unique general application submitters (all-time)
   - unique Service/Servant Leadership Masterclass registrants (all-time)
   - total Masterclass Registrations rows (all-time)
   
   Writes results into `network_stats_baselines`. Uses existing `AIRTABLE_API_KEY` connector via gateway, JWT-validated, zod-validated, CircuitBreaker-wrapped per project standards.

4. **Schedule it via pg_cron** to run daily at 06:00 UTC; also expose a "Refresh now" admin-only invoke from System Health for manual sync.

5. **BDD scenarios** added to `bdd_scenarios` covering: equation correctness (UI + DB + Code Then-clauses), baseline-update flow, Airtable failure → keep last-known values (graceful degradation), unauthorized refresh rejected.

## Why this is safe & accurate
- Numbers can only go up: platform count grows naturally, Airtable baseline is refreshed (never reset to 0 on failure — last-known value is kept).
- One source of truth: change the formula or baseline in one place.
- Auditable: `last_synced_at` shown in System Health.
- No UI regression: same fields, same widget, same display.

## Files touched
- new migration: table + updated `get_network_stats()` + pg_cron schedule
- new edge function: `supabase/functions/sync-airtable-network-stats/index.ts`
- small admin trigger button in System Health (read-only otherwise)
- BDD scenario rows
