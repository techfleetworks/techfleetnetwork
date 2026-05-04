---
name: Fleety Cost Pipeline (L1–L6)
description: Every Fleety turn passes L1 quota → L2 canned → L3 semantic cache → L4 router → L5 lean RAG → L6 model+counter. Cache keys include audience+kb_version; thumbs-down purges row served by that turn.
type: feature
---
- L1 quota: 30/day, 150/mo per user via `check_fleety_user_quota` RPC, returns 429 with friendly message + 3 alt links.
- L2 canned: `fleety_match_canned_answers` (admin-curated, gated by promote action in System Health > Fleety).
- L3 semantic cache: `fleety_cache_semantic_lookup` (cosine ≤0.05, 7d TTL, audience+kb_version key). Hit replays cached markdown via `buildCacheSSEStream` (24-char SSE chunks, 8ms cadence) so streaming UX is identical. Header `X-Fleety-Cache: hit|miss`. Cost row recorded via `fleety_record_cost`.
- L3 write-back: only when no canned hit, no web sources, response 80–16000 chars, query ≤800 chars. Stored on stream flush via `fleety_cache_store(_query_embedding, _turn_id)`.
- Thumbs-down: `trg_fleety_feedback_purge_cache` deletes the cache row whose `last_turn_id` matches the downvoted turn.
- KB version: `bump_fleety_kb_version()` from ingest/content edits invalidates all cache rows automatically (lookup filters on current version).
- Promotion: `fleety_promote_turn_to_canned(turn_id, pattern, answer_md, audience)` admin-only RPC; UI also writes directly via RLS in FleetyHealthTab.
- BDD: F-COST-001..F-COST-006 in `bdd_scenarios`.
