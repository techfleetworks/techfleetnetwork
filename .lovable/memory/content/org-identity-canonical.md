---
name: Canonical Org Identity in Fleety KB
description: The 9 `org://*` knowledge_base rows are the single source of truth for Tech Fleet's mission, vision, values, narrative, programs, strategy, commitment, business plan, and partnership offerings. Update these rows (not the GitBook pages) when org content changes.
type: feature
---

Fleety answers about Tech Fleet's organizational identity from these 9 canonical rows in `public.knowledge_base`:

- `org://mission-vision-values` — Mission, Vision, Values, Offerings
- `org://narrative` — Why Tech Fleet exists (full narrative)
- `org://team-practices` — The 7 Team Practices
- `org://programs` — Project Training, Learning Labs, Community Collaboration
- `org://product-service-offering` — Product & Service Offering
- `org://three-year-strategy` — 3-year strategy + theory of change
- `org://ten-year-commitment` — 10,000 service leaders by 2035
- `org://business-plan` — Business plan summary
- `org://ways-to-partner` — Partnership paths

**Rules:**
- When org content changes (mission rewording, new strategy, new programs, etc.), UPDATE these rows. Set `embedding = NULL` and `embedding_updated_at = NULL` so the daily `fleety-embed-backfill-daily` cron re-vectorizes them. The `trg_kb_bump_version` trigger auto-invalidates Fleety's L3 semantic cache.
- The legacy GitBook pages under `https://guide.techfleet.org/about-us/about-our-org/*` are deprecated stubs. Do NOT add new content there. The exception is `.../we-live-by-the-collective-agreement`, which is still accurate.
- Notion source URLs are in each row's content footer (`Source: https://www.notion.so/...`) so Fleety can cite them.
- `fleety-embed` accepts service-role auth via either `SUPABASE_SERVICE_ROLE_KEY` exact match OR a JWT whose decoded `role` claim is `service_role` (covers key-rotation periods where pg_cron jobs hold the previous JWT).
