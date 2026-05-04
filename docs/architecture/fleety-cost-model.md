# Fleety Cost Model

Target: **≤ $100/mo** worst-case viral month at 10K MAU (72,000 turns).
Per-turn budget: **$0.00139**. Achieved by layering cache + tiering + caps + lean RAG + cost guard — no single lever suffices.

## The 6-Layer Pipeline

```
turn → L1 quota → L2 canned → L3 semantic cache
     → L4 tier router → L5 lean RAG → L6 model + cost counter
```

| Layer | What | Knob |
|------|------|------|
| L1 Quota | 30/day, 150/mo per user | `check_fleety_user_quota` RPC |
| L2 Canned | Embedding match against admin-curated FAQs | `fleety_match_canned_answers`, threshold 0.88 |
| L3 Cache | Semantic + audience + kb_version, 7d TTL | `fleety_cache_semantic_lookup`, distance ≤0.05 (tightens to 0.08 under guard) |
| L4 Router | Heuristic A/B/C, no LLM call | length, /deep, complexity heuristics |
| L5 Lean RAG | KB top-K × 800ch + conditional framework/few-shot/workshop | `KB_TOPK` ∈ {3,4,5,6} per guard step |
| L6 Model + counter | Tiered model, prompt-prefix caching, abort-on-unmount | `fleety_record_cost(turn_id, model, tokens_in, tokens_out, est_usd)` |

## Tier Token Caps

| Tier | Model | In cap | Out cap | Use |
|------|-------|--------|---------|-----|
| A | google/gemini-2.5-flash-lite | 3,000 | 300 | Definitions, simple lookups |
| B | google/gemini-3-flash-preview | 7,000 | 600 | Default conversational |
| C | google/gemini-3-flash-preview + reasoning low | 10,000 | 1,500 | /deep, multi-step, workshop intent |

## Worst-Case Math (72,000 turns)

| Segment | Share | Turns | $/turn | Subtotal |
|--------|------|------|--------|---------|
| L1 capped | 5% | 3,600 | $0 | $0.00 |
| L2 canned | 24% | 17,280 | $0.00005 | $0.86 |
| L3 cache | 21% | 15,120 | $0.00005 | $0.76 |
| Tier A | 20% | 14,400 | ~$0.00045 | $6.48 |
| Tier B | 27% | 19,440 | ~$0.0033 | $64.15 |
| Tier C | 3% | 2,160 | ~$0.0095 | $20.52 |
| Embedding (every turn) | 100% | 72,000 | $0.00005 | $3.60 |
| Firecrawl (narrowed) | 5% | 3,600 | $0.002 | $7.20 |
| **Fleety total** | | | | **≈ $103.57** |

Cost guard auto-tightens caches/tiers when 30-day projection > $120, bounding worst case to **~$90–110/mo**.

## Knobs

| Env / DB | Default | Effect |
|----------|---------|--------|
| `FLEETY_LEAN_RAG` | `on` | Off → fall back to full RAG (rollback) |
| `fleety_cost_guard_state.threshold_soft_usd` | 120 | Soft step trigger |
| `fleety_cost_guard_state.threshold_medium_usd` | 140 | Medium step trigger |
| `fleety_cost_guard_state.threshold_hard_usd` | 170 | Hard step trigger |
| `fleety_cost_guard_state.mode` | `auto` | Force `none`/`soft`/`medium`/`hard` for incident response |
| Per-user quota override | NULL | Admin field on User Admin page |

## Quality Guardrails

- Cache key includes `kb_version` → KB ingest invalidates all rows automatically.
- Thumbs-down (`fleety_turn_signals.rating = -1`) → trigger purges that cache row.
- Canned answers gated by admin promotion only.
- Weekly thumbs-rate digest with per-tier breakdown; rollback any layer on >5pt drop.
- Tier C remains full-fat — admins notice these.

## Non-Goals

Global lite-model swap; removing framework graph; removing conversation history; paywall/upsell; auth/RLS regressions.
