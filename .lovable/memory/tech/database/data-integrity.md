---
name: Data integrity triggers
description: Immutable profile emails, cascading user deletion, and profile-delete → auth.users cascade
type: feature
---

# Data integrity triggers

## profiles.email is immutable
Trigger blocks any UPDATE that changes `profiles.email`.

## auth.users DELETE cascade (`handle_user_deletion`)
On DELETE of an `auth.users` row, removes child rows in: user_quest_selections, push_subscriptions, chat_messages, chat_conversations, journey_progress, announcement_reads, dashboard_preferences, grid_view_states, project_applications, general_applications, admin_promotions, user_roles, notifications, feedback, profiles.

**Does NOT touch `audit_log`** — that table is append-only by SOC 2 policy. Earlier versions of this trigger tried to DELETE from audit_log and were silently failing on every cascade, leaving auth records orphaned. Do not re-add audit_log to this list.

## profiles DELETE → auth.users DELETE cascade (`cascade_delete_auth_user_on_profile_delete`)
On DELETE of a `public.profiles` row, removes the matching `auth.users` row. This guarantees that any code path that deletes a profile (admin purge, user self-delete, manual cleanup) cannot leave an orphan auth record. Without this, "deleted" emails appear free in User Admin but Supabase Auth still blocks fresh signups for them with a silent no-op (`user_repeated_signup`).

The cascade is one-way safe because `handle_user_deletion` (auth → profile) and this trigger (profile → auth) form an idempotent loop: when one fires the other no-ops because the partner row is already gone.

Errors are swallowed and written to `audit_log` as `cascade_auth_delete_failed` so a failed auth cleanup never blocks the profile delete.
