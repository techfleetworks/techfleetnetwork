---
name: Error Triage Queue
description: AI-assisted error triage loop — agent_fix_queue table, triage-error edge fn, System Health Triage tab; daily AI cap of 20/day
type: feature
---

# Error Triage Queue (Self-Healing Loop)

## Purpose
Turn audit_log error events into a deduplicated, actionable queue with optional
AI triage that produces a root-cause hypothesis and a list of files to change.
Admin opens the Triage tab in System Health, clicks **Triage** on a pending row,
the system calls Lovable AI once, persists the result, and offers a
"Copy fix prompt" action to paste into Lovable chat for one-click application.

## Tables
- `agent_fix_queue` — one row per unique error fingerprint
  - `fingerprint` (UNIQUE), `event_type`, `source`, `error_message`, `severity`
  - `status` ∈ pending | triaged | proposed | applied | dismissed | resolved
  - `occurrence_count`, `first_seen_at`, `last_seen_at`
  - `root_cause_hypothesis`, `proposed_fix_summary`, `proposed_fix_files` JSONB
  - `triage_model`, `triage_tokens_in/out`, `triage_cost_estimate_usd`
  - RLS: admin-only SELECT/UPDATE; INSERT/DELETE only via SECURITY DEFINER RPCs
- `agent_triage_budget` — single-row daily counter (id=1, day, triage_calls_used)

## RPCs
- `upsert_fix_queue_entry(fingerprint, event_type, source, message, severity, trace_id)`
  — SECURITY DEFINER, granted to authenticated. Idempotent upsert; bumps counter
  on conflict. Reopens resolved/dismissed rows if the same fingerprint reappears.
- `claim_triage_budget(p_cap default 20)` — atomic increment, returns false if cap hit.
  Service-role only.
- `set_fix_queue_status(p_id, p_status, p_reason)` — admin-only; emits a
  `fix_queue_status_changed` audit_log row for accountability.

## Edge function: `triage-error`
- POST `{fix_queue_id}`. Validates JWT + admin role.
- Claims one slot from `agent_triage_budget` (hard cap **20/day** tenant-wide).
- Calls `google/gemini-2.5-flash` via Lovable AI Gateway with a strict
  JSON-only system prompt; tolerates ```json fences.
- Persists `root_cause_hypothesis`, `proposed_fix_summary`, `proposed_fix_files[]`,
  token counts and cost estimate. Sets status to `proposed` (if files) or `triaged`.
- Returns 429 with `daily_cap_reached` when exhausted. Telemetry-safe (never throws).

## Client integration
- `error-reporter.service.ts → writeAudit()` calls `upsert_fix_queue_entry` after
  every audit insert except `severity === "info"` and `client_error_overflow`.
- System Health → **Triage** tab (`src/components/system-health/TriageTab.tsx`)
  shows pending/triaged/proposed entries (top 50, on-demand fetch — no realtime),
  AI budget (used/20), Triage button, Details dialog with Dismiss / Resolve /
  Copy fix prompt actions.

## Cost discipline
- AI calls hard-capped at 20/day, enforced **before** invoking the gateway.
- One AI call per triage; Gemini 2.5 Flash (cheapest reasoning model).
- No realtime, no polling — fetch only on tab open and explicit Refresh.
- Cost estimate stored per row for visibility (~$0.30/M in, ~$2.50/M out).

## BDD
TRIAGE-001..006 in `bdd_scenarios` (feature_area_number 1114).
