# Runbook: Fleety Cost Guard

Auto-engages when projected 30-day spend exceeds thresholds. Read by `techfleet-chat` at the start of every request via `fleety_cost_guard_step()`.

## Steps

| Step | Trigger | Effect | Reversible |
|------|---------|--------|------------|
| **none** | projection ≤ $120 | Normal operation | — |
| **soft** | > $120 | Cache distance 0.05→0.08 (more hits), `KB_TOPK` 6→5 | Auto-revert next hour when projection drops |
| **medium** | > $140 | + `KB_TOPK` → 4, Firecrawl disabled, definition queries forced to Tier A | Auto-revert |
| **hard** | > $170 sustained | + Non-admin live calls 429 with friendly toast: "Fleety is catching her breath, try the search bar." Admins bypass. `KB_TOPK` → 3 | Admin override |

## Where to look

- **Live status**: System Health → Fleety tab → Cost Panel (banner shows current step + projection).
- **Numbers**: `fleety_cost_projection()` RPC returns `today_usd`, `projection_30d_usd`, layer hit-rates.
- **History**: `fleety_cost_counters` (hourly) and `fleety_cost_daily_mv` (14-day rollup in panel).
- **Top offenders**: `fleety_top_expensive_turns()` — promote high-volume queries to canned.

## Manual Override

System Health → Fleety → Cost Panel → "Force mode" dropdown:
- `auto` (default) — thresholds drive the step
- `none` — disable guard (use during legit spike, e.g. workshop kickoff)
- `soft` / `medium` / `hard` — pin a step

Override writes `fleety_cost_guard_state.mode`. **Always document the reason** in the audit_log entry that the UI creates.

## Incident response

1. Open the Cost Panel. Confirm projection vs threshold.
2. Check "Top expensive turns" — if 1–2 queries dominate, click **Promote to canned** and write a short answer. They'll never hit the model again.
3. If projection still rising, force `medium` for the rest of the day.
4. If a workshop or launch is causing legit spike, force `none` and raise `threshold_soft_usd` temporarily.
5. Post-incident: review `fleety_turn_signals` thumbs-rate per tier — if it dropped >5pts, roll back any RAG/router change first.

## Rollback levers

- `FLEETY_LEAN_RAG=off` env → full RAG
- Force `none` mode → disable all guard tightening
- `DELETE FROM fleety_response_cache WHERE kb_version = current` → purge stale cache
- Set router env to single-tier → all turns Tier B (cost goes up but quality stable)
