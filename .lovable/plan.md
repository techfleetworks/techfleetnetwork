# Fleety + Platform Cost Plan v2 — Target ≤ $100/mo Worst-Case Viral Month @ 10K MAU

## 1. The target, in plain numbers

| Variable | Steady state | **Viral month** |
|---|---|---|
| MAU | 10,000 | 10,000 |
| % who chat Fleety | 30% | **60%** |
| Turns / chatter / month | 6 | **12** |
| **Total Fleety turns** | 18,000 | **72,000** |
| DB read RPS (peak) | ~40 | **~180** |
| Cron invocations / mo | ~530K | **~530K** (constant) |

**Budget per turn to land at $100/mo: $0.00139.**
Today's per-turn cost is ~$0.0095, so we need a **~7× reduction** — only achievable if a large share of turns cost **≈$0** (cache/canned) and the rest cost ≪$0.005, plus DB hygiene.

## 2. Three goals, in priority order

1. **Quality first** — answer accuracy and warmth must not measurably drop. Track via `fleety_turn_signals` thumbs-rate weekly; rollback if it falls >5 pts.
2. **UX invisible** — no extra clicks, no auth prompts, no "click to load more". Caching/tiering happens server-side.
3. **Cost bounded** — hard ceiling enforced by a cost guard, not hope.

## 3. The 6-layer pipeline (every turn flows through these)

```text
turn  →  L1 quota  →  L2 canned  →  L3 semantic cache
      →  L4 tier router  →  L5 lean RAG  →  L6 model + cost counter
```

| Layer | What it does | Quality risk | UX impact |
|---|---|---|---|
| L1 Per-user soft cap | 30/day, 150/mo per user | Power-user friction | Friendly redirect to KB, search, office hours |
| L2 Canned answers + fuzzy | Embedding match top 200 FAQs | Stale if KB changes | None (instant reply) |
| L3 Response cache | Semantic + audience + kb_version key, 7d TTL | Slight personalization loss | None (faster) |
| L4 Tier router | Heuristic A/B/C, no LLM call | Mis-tier = weaker reply | None |
| L5 Lean RAG | KB top-4 × 800ch, conditional framework/few-shot/workshop | Less context for complex Qs | None — Tier C still gets full context |
| L6 Model call + counter | Tiered model + prompt-prefix caching + abort-on-unmount | None | None |

## 4. Worst-case math after refactor (72K turns)

| Segment | Share | Turns | $/turn | Subtotal |
|---|---|---|---|---|
| L1 capped | 5% | 3,600 | $0 | $0.00 |
| L2 canned hits | 24% | 17,280 | $0.00005 | $0.86 |
| L3 cache hits | 21% | 15,120 | $0.00005 | $0.76 |
| Tier A (lite, 3K in / 300 out) | 20% | 14,400 | ~$0.00045 | $6.48 |
| Tier B (flash-preview, 6K in / 600 out) | 27% | 19,440 | ~$0.0033 | $64.15 |
| Tier C (flash-preview + reasoning low, 10K in / 1.5K out) | 3% | 2,160 | ~$0.0095 | $20.52 |
| Embedding (every turn) | 100% | 72,000 | $0.00005 | $3.60 |
| Firecrawl (narrowed) | ~5% | 3,600 | $0.002 | $7.20 |
| **Fleety total** |   |   |   | **≈ $103.57** |

Plus a **cost guard** (§7) that auto-tightens caches/tiers when the 30-day projection exceeds **$120**, bringing the worst-case ceiling to **~$90–110/mo**.

## 5. Database cost story (separate but co-billed)

| Source | Today | After |
|---|---|---|
| `cron.job_run_details` | 2.2 GB, +30 GB/yr | 7-day rolling, **~50 MB** |
| `audit_log`, `email_send_log` | unbounded | monthly partitions, drop > 90 d |
| `process-email-queue` cron | every 5 s (518K/mo invocations) | every 60 s + LISTEN/NOTIFY trigger for instant sends |
| Realtime polling | 30–60 s on dashboards | adaptive (already in place) |

**DB growth: 12 GB/yr → ~3 GB/yr.** Egress and compute charges drop accordingly — at the current Cloud tier, this keeps us inside the included $25/mo Cloud balance even in viral months.

## 6. Quality guardrails — how we *don't* sacrifice answers

1. **Tier C remains full-fat.** Long, multi-step, or `/deep` queries get the same context budget as today. Less than 5% of turns, but they're the ones admins notice.
2. **Cache key includes `kb_version`.** Any KB ingest bumps the version → cache invalidates automatically. No stale facts after content edits.
3. **Canned answers gated by admin promotion.** A turn is only promoted to canned via the System Health → Fleety tab "Promote to canned" button. No auto-canning.
4. **Thumbs-down auto-bypasses cache.** If a cached response gets a thumbs-down, that cache row is invalidated immediately and the next identical query hits the live model.
5. **Weekly quality digest** (already running on `fleety_turn_signals`) gains a per-tier breakdown so we can see if Tier A/B is regressing.
6. **A/B shadowing for one week** before full rollout: run lean RAG in shadow mode, log token counts and (if user opts into anonymous quality study) the alternate response, compare thumbs distributions.

## 7. The cost guard (the safety net)

A new `fleety_cost_counters(hour, tokens_in, tokens_out, model, est_usd)` table fed by every edge-function turn. An hourly cron projects 30-day spend. If projection > **$120**:

| Step | Action | Reversible |
|---|---|---|
| Soft (>$120) | Raise cache cosine threshold 0.95 → 0.92, demote Tier B input cap 7K → 5K | Auto-revert next hour if projection drops |
| Medium (>$140) | Disable Firecrawl; force Tier B → Tier A for definition queries | Same |
| Hard (>$170) | Pause non-cached turns for non-admin users for 1 hour, show "Fleety is catching her breath, try the search bar" toast | Admin one-click override |

Admins see a live banner in System Health → Fleety with current $/day, projection, and which step (if any) is engaged.

## 8. UX details (what the user actually sees)

- **Daily cap reached:** toast "You've hit Fleety's daily limit. Try the search bar, KB, or book office hours →" with three buttons. No dead end.
- **Cache hit:** identical streaming-typing UX (we replay the cached markdown character-by-character). User cannot tell.
- **Tier A reply:** slightly shorter; we add a "Want more detail?" inline chip that re-runs as Tier B. One click, no retyping.
- **Cost guard engaged:** **end users see nothing** unless we hit the Hard step. Admins see the banner.
- **Power user override:** admins can grant per-user higher caps from the User Admin page (already exists; we add a "Fleety quota" field).

## 9. Build plan — phased, each phase shippable independently

### Phase 1 — Foundations (1 sitting)
1. Migration: `fleety_response_cache` (query_hash, embedding vector(1536), audience, kb_version, response_md, sources jsonb, hits int, last_used_at). Service-role RLS.
2. Migration: `fleety_user_quota` view + `check_fleety_user_quota(user_id)` RPC.
3. Migration: `fleety_kb_version` singleton, bumped by ingest jobs (and on admin content edits — already wired via the Content Gaps re-embed).
4. Migration: `fleety_cost_counters` + hourly aggregation cron.
5. Edge fn refactor `techfleet-chat/index.ts`: insert L1 quota, L4 heuristic router, L5 lean RAG, L6 prefix pinning + counter writes.
6. BDD scenarios:
   - **F-COST-001** Quota exceeded → [UI] friendly toast + 3 alt links · [DB] counter row · [Code] 429 with `retry_after`.
   - **F-COST-002** Tier-A query routes to lite model → [DB] `turn_signal.tier='A'` · [Code] model field = lite · [UI] "Want more detail?" chip rendered.
   - **F-COST-003** Lean RAG ≤ 7K tokens for Tier B → [Code] systemPromptLength assertion · [DB] turn_signal.tokens_in ≤ 7000.

### Phase 2 — Cache + Canned (1 sitting)
7. Build embedding index of canned answers; `fleety_canned_match(embedding, threshold)` RPC.
8. Cache lookup helper + write-back stream wrapper (replays cached markdown with simulated typing).
9. System Health → Fleety: "Promote turn to canned answer" one-click action on logged turns.
10. Thumbs-down hook → invalidate that cache row.
11. BDD:
   - **F-COST-004** Identical query returns cached answer → [DB] `cache.hits++` · [Code] no AI gateway call · [UI] same markdown rendered with stream animation.
   - **F-COST-005** KB version bump invalidates cache → [DB] kb_version mismatch → miss · [Code] new model call recorded.
   - **F-COST-006** Thumbs-down purges cache row → [DB] row deleted · [Code] next identical query hits model.

### Phase 3 — Cost guard + observability (1 sitting)
12. Hourly cron aggregates counters → `fleety_cost_daily_mv`.
13. Cost-guard logic in edge fn (read latest projection at request start).
14. System Health → Fleety additions: today's $, 30-day projection, hit-rate per layer (L1/L2/L3/A/B/C), top-10 expensive queries with "promote to canned", cost-guard status badge.
15. Self-healing alert (existing channel) when projection > $120.
16. BDD:
   - **F-COST-007** Cost guard engages above $120 projection → [DB] guard flag set · [UI] admin banner visible · [Code] Tier-B cap reduced to 5K.

### Phase 4 — DB hygiene (independent, also part of cost story)
17. Daily prune of `cron.job_run_details` keep 7 d. Reclaims 2.2 GB immediately.
18. Monthly partitioning of `audit_log`, `email_send_log`; drop > 90 d.
19. `process-email-queue`: 5 s → 60 s + Postgres `NOTIFY` on insert → edge fn picks up instantly. Cuts 99% of empty invocations while keeping send latency under 1 s.
20. Self-healing alert when `cron.job_run_details > 500 MB` or DB grows > 500 MB/wk.
21. BDD:
   - **F-DB-001** Cron history pruned → [DB] rows < 7 d only · [Code] prune cron logged.
   - **F-DB-002** Email queue notify path → [DB] insert → [Code] worker invoked < 1 s · [UI] email shows "sent" within normal window.

### Phase 5 — Memory + docs
22. `mem://tech/cost-controls` (NEW Core entry): "Every Fleety turn passes L1–L6; new context blocks must respect token caps and cache keys."
23. Update `mem://features/chatbot/fleety` with tier system, caps, cache layers.
24. `docs/architecture/fleety-cost-model.md` — formulas, tier table, knobs, $103 worst-case derivation.
25. `docs/runbooks/fleety-cost-guard.md` — what triggers each step, how to override.
26. `docs/runbooks/db-retention.md` — partition + prune schedule.

## 10. Per-feature impact at 72K viral turns

| Feature | Before | After | UX impact |
|---|---|---|---|
| Fleety chat cost | ~$700/mo viral | **~$100/mo viral** | None for normal users |
| p50 latency | ~700 ms | ~250 ms (cache hit ~80 ms) | **Faster** |
| Spam-prone power user | infinite | 150/mo cap, polite redirect | New friendly block |
| Workshop deep-dives | always full context | only on workshop intent | Same when relevant |
| Admin $ visibility | none | live dashboard + alerts | Major upgrade |
| Tier-A definition reply | full flash-preview | lite model + "more detail?" chip | Slightly terser; 1 click for full |
| DB growth | +12 GB/yr | **+3 GB/yr** | None |
| Cron history | unbounded, 2.2 GB | 7-day rolling | None |
| Email queue invocations | 518K/mo | ~5K/mo + push triggers | Faster, not slower |
| Answer quality (thumbs-up rate) | baseline | tracked weekly; rollback if -5 pts | Monitored, not assumed |

## 11. Risks & rollback

| Risk | Mitigation | Rollback |
|---|---|---|
| Lean RAG hurts answers | Shadow A/B for 1 week before flip; thumbs delta gate | Single env var: `FLEETY_LEAN_RAG=off` |
| Cache returns stale info | kb_version key + 7d TTL + thumbs-down purge + admin "purge all" button | One DELETE |
| Tier router miscategorizes | Log every decision; admins promote queries up; weekly review | Disable router → all turns Tier B |
| Quota angers a power user | 150/mo is generous; admins can raise per user; redirect is helpful, not a wall | Raise default cap via env var |
| Cost guard activates during legit spike | Visible admin banner; never silent; Hard step requires sustained $170 projection | Admin one-click disable |
| Email NOTIFY trigger misses | 60 s safety-net cron still runs | Revert to 5 s cron |

## 12. Hard non-goals

- **Will not** drop the main answer model to lite globally (quality regression).
- **Will not** remove the framework graph (it's the differentiator).
- **Will not** remove conversation history (we summarize older turns instead).
- **Will not** add any auth, MFA, or RLS regressions.
- **Will not** add a paywall, upsell, or "upgrade for more Fleety" CTA.

## 13. Bottom line

$100/mo viral-month is reachable **only** when caching, tiering, per-user caps, lean RAG, **and** the cost guard are layered together — no single lever is sufficient. The plan above bounds spend, preserves answer quality through measurable guardrails, keeps the UX identical for normal users, and gives admins the first real-time view of Fleety's cost per turn.

Approve this plan and I'll execute Phase 1 first, then pause for you to verify quality metrics before moving to Phase 2.
