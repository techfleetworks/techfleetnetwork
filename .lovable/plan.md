## Hardening Pass — Linter Cleanup

Goal: clear all 53 outstanding Supabase linter warnings without changing user-visible behavior. These are pre-existing warnings, not regressions from the Content Gaps work.

## What's flagged (53 warnings)

| # | Lint code | Count | What it is |
|---|---|---|---|
| 1 | 0011 search_path mutable | 1 | One function missing `SET search_path` |
| 2 | 0014 extension in public | 2 | `pg_trgm` and `vector` extensions live in `public` |
| 3 | 0016 materialized view in API | 1 | A `framework_*` MV is reachable through PostgREST |
| 4 | 0025 public bucket listing | 1 | `client-logos` + `class-hero-images` buckets allow `LIST` |
| 5 | 0028 anon EXECUTE on SECURITY DEFINER | 11 | Functions callable without sign-in |
| 6 | 0029 authenticated EXECUTE on SECURITY DEFINER | 33 | Helper/audit/admin functions callable by any signed-in user |

The 0028+0029 items are the bulk. They include audit triggers, admin-only helpers (e.g. `archive_class`, `approve_and_publish_class`), framework helpers (`fw_lookup_relationships`, `fw_refresh_search_mv`), and stats RPCs (`get_network_stats`, `get_member_country_distribution`).

## Categorization (decides remediation, not flag-by-flag)

**A. Trigger-only DEFINERs (~12 fns: `audit_*`, `handle_*`)**
Never called by clients — only fire from triggers. Action: `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`. Linter clears, behavior unchanged.

**B. Admin-only RPCs (~10 fns: `archive_class`, `cancel_cohort`, `approve_and_publish_class`, `cleanup_*`, `_consume_device_nonce`, etc.)**
Currently rely on inner `has_role('admin')` checks. Action: `REVOKE EXECUTE FROM anon, authenticated`; `GRANT EXECUTE TO service_role` only. UI paths that call these go through edge functions using service-role, so no UX change.

**C. Public-data RPCs intentionally reachable (~6 fns: `get_network_stats`, `get_member_country_distribution`, `get_course_completion_counts`, `fw_lookup_relationships`, `get_nodes_neighbors_batch`, `fw_sync_relationships_to_kb`)**
These power public widgets and Fleety. Action:
- Keep `GRANT EXECUTE TO authenticated` (and `anon` only for the truly public ones — network stats, member country distribution).
- Switch to `SECURITY INVOKER` where they only read public/RLS'd tables.
- Where they must stay `SECURITY DEFINER` (e.g. cross-table aggregates), record the exception in security memory so the linter understands the intent.

**D. Helper utilities (`check_rate_limit`, `cleanup_rate_limits`, etc.)**
Action: revoke from anon/authenticated, keep service_role.

**E. Functions missing `SET search_path` (1 fn + any DEFINER without it)**
Action: `ALTER FUNCTION … SET search_path = public, pg_temp` for every remaining DEFINER. Standard hardening.

## Infra fixes

**Extensions in public (`pg_trgm`, `vector`):** Move to a dedicated `extensions` schema. This is a 2-line migration but requires updating any function/view that references operator classes by unqualified name. Plan: create `extensions` schema, `ALTER EXTENSION … SET SCHEMA extensions`, then add `extensions` to the search_path of the few RPCs that use `<->` (vector) or `%` (trgm).

**Materialized view in API:** `REVOKE ALL ON public.<mv> FROM anon, authenticated;` and call it server-side only via the existing RPC wrappers. No client changes needed because nothing currently reads the MV directly through PostgREST.

**Public buckets (`client-logos`, `class-hero-images`):**
Both are intentionally world-readable for public marketing pages. The lint flags broad `LIST`, not `SELECT`.
Action: add a storage policy that allows `SELECT` on individual objects but denies `LIST` on the bucket root — files are still hot-linkable by URL, but the bucket index is no longer enumerable.

## Execution plan

1. **Single migration** with 4 sections, in order:
   1. `ALTER FUNCTION` statements adding `SET search_path = public, pg_temp` to every DEFINER missing it.
   2. `REVOKE EXECUTE` statements per category A/B/D from anon + authenticated.
   3. Move `pg_trgm` and `vector` to `extensions` schema; update the small set of functions that need `extensions` in their search_path.
   4. Tighten public-bucket policies and revoke MV API access.

2. **Smoke-test endpoints** that depend on the touched RPCs:
   - Network stats widget on the Dashboard
   - Member country distribution on the public landing
   - Fleety chat (calls `fw_lookup_relationships`, `get_nodes_neighbors_batch`)
   - Admin "Approve & Publish Class" / "Archive Class" flows
   - Class hero image and client logo loading

3. **Re-run `supabase--linter`** — expect 0 warnings. Anything that legitimately must remain (e.g. a truly public DEFINER) gets recorded in `security--update_memory` with rationale and marked via `manage_security_finding`.

4. **BDD scenarios** added to `bdd_scenarios` (feature_area `security-hardening`):
   - SH-001 Anon cannot execute formerly-anon-callable admin RPCs ([Code] 401/permission-denied; [DB] no audit row written; [UI] admin flow still works for admins)
   - SH-002 Authenticated non-admin cannot execute admin RPCs ([Code] permission-denied; [UI] no regression on member dashboards)
   - SH-003 Public buckets serve known files but reject LIST ([Code] LIST → 403; [UI] logos/hero images still render)
   - SH-004 Linter run reports 0 SECURITY warnings post-migration ([Code] linter exit code clean)

## Out of scope

- Refactoring DEFINER functions into pure SQL/RLS equivalents (bigger lift; current patch is grants + search_path + schema moves only).
- Auth changes (HIBP toggle, MFA scope) — covered by separate memories.
- Touching `auth`, `storage`, `vault`, `realtime`, `supabase_functions` schemas — explicitly forbidden.

## Risks & rollback

- **Risk:** revoking EXECUTE on a function actually called by a logged-in user from the browser. Mitigation: smoke-test list above; rollback is `GRANT EXECUTE TO authenticated` per function.
- **Risk:** moving `vector` schema breaks an unqualified `<->` operator usage. Mitigation: pre-flight `rg "<->" supabase/` and patch search_paths in the same migration.
- **Risk:** bucket LIST policy too tight breaks an admin gallery. Mitigation: grant LIST to `service_role` and authenticated admins only.

After your approval, I'll execute the migration, run the smoke tests, re-lint, and report 0 warnings (or document any intentional exceptions in security memory).
