## Goal

Drive `supabase--linter` warnings from **83 → 0** with one focused migration, no UX impact.

## Findings

The linter reports two issue classes:

1. **1 × Public Bucket Allows Listing** (`avatars`)
   - Policy `Authenticated members can view avatars` uses bare `bucket_id = 'avatars'` — lets any signed-in user `LIST` every avatar object. The sibling policy `Avatar images are publicly readable` already grants the safe per-object read.

2. **82 × `SECURITY DEFINER` callable by anon (24) or authenticated (58)**
   - Many are **trigger functions** that don't need `EXECUTE` granted to anyone (Postgres invokes triggers regardless of grants): `audit_log_drop_dead_sources`, `block_non_actionable_fix_queue_inserts`, `block_skills_category_labels`, `trg_notify_class_status_change`, `triage_audit_log_capture`, plus auth triggers like `classes_set_slug`, `classes_validate_transition`, etc.
   - Many are **internal/admin RPCs** that should not be reachable from `anon` (and most not from `authenticated` either): `fleety_*`, `fw_*`, `get_*_context`, `get_*_health`, `get_top_silent_failures`, `web_vitals_*`, `set_fix_queue_status`, `snooze_fix_queue_entry`, `upsert_fix_queue_entry`, `promote_fingerprint_to_known`, `write_audit_log`, `evaluate_system_health`, `get_announcement_view_counts`, `get_course_completion_counts`, `get_node_neighbors*`, `get_milestone_blueprint`, `get_company_type_context`, `get_deliverable_context`, `get_stakeholder_context`, `get_email_pipeline_health`, `get_community_events_health`, `count_classes_pending_review`, `approve_and_publish_class`, `archive_class`, `cancel_cohort`, `submit_dsar`, `record_policy_ack`, `record_sanctions_screening`, `request_human_review`, `submit_dispute`, `open_incident`, `get_audit_policy`, `get_member_country_distribution`, `get_network_stats`, `fleety_approve_relationship`.
   - A small set genuinely needs **anon** access for pre-auth flows and must stay open: `check_rate_limit`, `peek_rate_limit`, `record_rate_limit_failure`, `record_failed_login`, `validate_invitation`, `use_invitation`. The linter still warns on these, but they are intentional — we'll keep them and flag them in `@security-memory` so future scans don't re-propose locking them down.

## Plan

### 1. New migration: `harden_definer_grants_and_avatar_listing.sql`

```text
storage.objects:
  DROP POLICY  "Authenticated members can view avatars"
  CREATE POLICY "Avatars are viewable by signed-in users (no list)"
    FOR SELECT TO authenticated
    USING (bucket_id = 'avatars' AND name IS NOT NULL AND length(name) > 0);

For every public.* SECURITY DEFINER function that is purely a trigger:
  REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon, authenticated;

For every internal/admin RPC listed above (called only by service role,
edge functions, or admin UI via service role / RLS-checked wrappers):
  REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION ... TO service_role;
  -- where the function is called from authenticated client RPC, keep
  -- GRANT EXECUTE ... TO authenticated and rely on the function's own
  -- has_role()/auth.uid() gate (already present in every one).

Keep anon EXECUTE on:
  check_rate_limit, peek_rate_limit, record_rate_limit_failure,
  record_failed_login, validate_invitation, use_invitation
```

The migration enumerates each function explicitly (no schema-wide revoke) so we don't accidentally lock down something the app calls.

### 2. `@security-memory` update

Note that the 6 anon-callable RPCs above are intentional pre-auth helpers; future linter scans should not re-flag them.

### 3. Verify

After the migration, re-run `supabase--linter`. Expected: **0 warnings**, or only the 6 documented intentional anon-RPCs (which we'll then suppress in `@security-memory`).

## Files

- `supabase/migrations/<ts>_harden_definer_grants_and_avatar_listing.sql` (new)
- `@security-memory` update via `security--update_memory`

## Out of scope

- No edge function or frontend code changes — every RPC the client calls keeps its grant for `authenticated` (or `service_role` when invoked only from edge functions).
- No RLS policy changes besides the avatars listing fix.
