# Smoke Test Plan — Fleety Cost Pipeline + Email Pipeline Health

Scope: validate the recent hotfixes end-to-end without regressing UX. Read-only inspection first, then guided UI interactions, then DB verification.

## Pre-flight (no UI yet)

1. `cloud_status` — confirm backend is `ACTIVE_HEALTHY`.
2. `analytics_query` on edge logs — confirm last deploys of `email-pipeline-health`, `resend-signup-confirmations`, and Fleety chat function returned 200s, no boot errors.
3. `read_query` baselines (snapshot counts so we can diff after the test):
   - `audit_log` rows where `event_type LIKE 'email_%_pipeline_unhealthy'` in last 24h
   - `email_send_log` latest-status counts per template via the new RPCs (`email_send_log_latest_stuck`, `email_send_log_latest_failed`) for `signup`, `recovery`, `transactional_emails`, `announcement`
   - `fleety_turn_signals` count, `fleety_response_cache` size, `fleety_cost_daily` today's row, `fleety_canned_answers` count
4. `linter` — confirm we are still at 43 pre-existing 0028 WARNs (no new findings from the new edge function or migrations).

## Manual probe invocations (no UI yet)

5. `curl_edge_functions` POST `/email-pipeline-health` with service-role auth — expect `{ok:true, probed:9, results:[...]}` and per-template `stuck`/`failed` counts. Confirm no template flips to `unhealthy:true` unexpectedly.
6. `curl_edge_functions` POST `/resend-signup-confirmations` — confirm it still runs without writing a spurious `email_signup_confirmation_pipeline_unhealthy` row when stuck count is 0.

## Browser smoke (logged-in admin)

7. `navigate_to_sandbox` `/` desktop (1440×900). Verify dashboard renders, no console errors.
8. Open Fleety chat widget. Send 5 turns spanning the L1–L6 pipeline:
   - T1: trivial greeting → expect L2 canned hit (no model call).
   - T2: same greeting reworded → expect L3 semantic cache hit.
   - T3: framework question (e.g. "What's a Product Strategist role?") → expect L5 RAG + L6 model.
   - T4: repeat T3 verbatim → expect L3 cache hit, no new model spend.
   - T5: ambiguous → expect router → model, then thumbs-down to verify cache purge path.
   Verify streaming Markdown, history persistence on reload, and that the widget never blocks main UI.
9. Navigate to **System Health → Fleety** tab. Confirm the panel renders:
   - 30-day cost projection number
   - L2/L3 hit-rates
   - Top expensive turns list
   - Canned answers + proposed relationships sections
   No empty/blank states, no console errors, no "forbidden" toasts.
10. Navigate to **System Health → Top Errors**. Confirm any pre-existing pipeline alerts are listed with non-null messages (the loosened fingerprint filter is working). No phantom signup-pipeline alert when stuck count = 0.
11. Mobile pass: re-navigate at 390×844, repeat steps 8–10 abbreviated. Verify 100dvh layout, sticky widget behavior, no horizontal scroll.

## Post-test DB verification

12. Re-run baseline `read_query`s and diff:
    - `fleety_turn_signals` should have grown by ~5 rows (one per turn, including cache hits).
    - `fleety_response_cache` should have ≥1 new entry from T3.
    - `fleety_cost_daily` today should reflect only T3+T5 model spend (T1/T2/T4 free).
    - No new `email_*_pipeline_unhealthy` audit rows unless a real stuck email exists.
13. `analytics_query` edge logs for `email-pipeline-health`, Fleety chat — confirm 200s, latency sane (<2s p95), no 5xx.
14. `linter` again — still 43 WARNs, no new ones.

## Pass/fail criteria

- PASS: all UI interactions render without error, Fleety pipeline tiers behave as expected, System Health → Fleety shows live data, no new linter findings, no spurious pipeline-unhealthy audit rows.
- FAIL (and auto-fix): any 4xx/5xx on the probed edge functions, blank System Health panel, missing turn signals on cache hits, new `_pipeline_unhealthy` rows for healthy templates, or new linter WARNs tied to recent migrations.

## Deliverable

A short report with: backend status, per-step pass/fail, before/after counts, screenshots of Fleety widget + System Health Fleety panel + Top Errors, and any auto-applied fixes.

Approve and I'll switch to build mode and execute.
