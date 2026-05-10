# Refresh Fleety's Knowledge Base — Tech Fleet Org Identity

## Goal

Make Fleety answer about Tech Fleet's mission, vision, values, strategy, offerings, and partnership model using the **new** narrative you provided — and stop pulling from the outdated `guide.techfleet.org` pages.

## Context (what's there today)

`knowledge_base` table holds Fleety's RAG corpus (1,153 rows, used by the L5 RAG step). Today's org-identity rows are scraped from the old GitBook:

- `https://guide.techfleet.org/about-us/about-our-org` — outdated
- `.../mission-and-values` — outdated
- `.../hello-world` — outdated
- `.../tech-fleets-roadmap` — outdated
- `.../we-live-by-the-collective-agreement` — keep (still accurate)

The Notion URLs you shared are private/gated — Fleety can't re-scrape them on its own, so the canonical text needs to be the narrative you pasted (plus the Notion URLs as references).

## Plan

### 1. Add 8 new canonical `org://` rows to `knowledge_base`

One row per topic, each with: full prose body, source Notion URL in the content footer, fresh embedding (768-dim, generated via existing Lovable AI embedding flow used elsewhere in the project), `scraped_at = now()`.

| `url` | `title` |
|---|---|
| `org://mission-vision-values` | Tech Fleet — Mission, Vision, Values, Offerings |
| `org://narrative` | Tech Fleet — Organizational Narrative (Why We Exist) |
| `org://team-practices` | Tech Fleet — The 7 Team Practices |
| `org://programs` | Tech Fleet — Programs (Project Training, Learning Labs, Community Collaboration) |
| `org://product-service-offering` | Tech Fleet — Product & Service Offering |
| `org://three-year-strategy` | Tech Fleet — Three-Year Strategy & Theory of Change |
| `org://ten-year-commitment` | Tech Fleet — 10-Year Commitment to the Mission (10,000 service leaders by 2035) |
| `org://business-plan` | Tech Fleet — Business Plan (Summary) |
| `org://ways-to-partner` | Tech Fleet — Ways to Partner |

Each row's content will be authored from the narrative + section headings you provided, with the matching Notion link appended as `Source: <notion-url>` so Fleety can cite it.

### 2. Retire the 4 outdated GitBook rows

Soft-deprecate by **overwriting their `content`** with a one-line redirect note:

> "This page is outdated. See canonical entries `org://mission-vision-values`, `org://narrative`, `org://team-practices`, `org://programs` for current Tech Fleet org identity."

Re-embed so semantic search no longer surfaces the stale prose. (Hard delete is risky — other code/links may reference these URLs; redirect-style overwrite is safer.)

Rows touched:
- `https://guide.techfleet.org/about-us/about-our-org`
- `.../about-our-org/mission-and-values`
- `.../about-our-org/hello-world`
- `.../about-our-org/tech-fleets-roadmap`

### 3. Bump KB version

The `trg_kb_bump_version` trigger fires automatically on every INSERT/UPDATE — this invalidates Fleety's L3 semantic cache (cache key includes `kb_version`), so users see fresh answers immediately. No manual cache purge needed.

### 4. Memory + BDD

- Add `mem://content/org-identity-canonical` — lists the 9 canonical `org://*` URLs as the single source of truth for org-identity Q&A; instructs future agents to update these rows (not the GitBook URLs) when the org narrative changes.
- Append BDD scenario `KB-ORG-REFRESH-001` to `bdd_scenarios`: Given Fleety is asked "what is Tech Fleet's mission?" When the L5 RAG step retrieves context, Then the top-1 chunk URL is `org://mission-vision-values` [DB] and the rendered answer references "build empowered team spaces" [UI] and the response includes the Notion source link [Code].

### 5. Verification

- `psql` row count: 9 new `org://*` rows present, all with `embedding IS NOT NULL`.
- Spot-check Fleety in preview: ask "What is Tech Fleet's mission?", "What are the team practices?", "How can my company partner with Tech Fleet?" — confirm answers cite the new content (mission = "build empowered team spaces", 7 named practices, 10K service leaders by 2035).
- Query `kb_versions` — version incremented; next Fleety turn forces L3 cache miss → fresh retrieval.

## Technical details

- **Migration**: one SQL migration that (a) UPSERTs the 9 `org://*` rows with NULL embedding, (b) UPDATEs the 4 outdated GitBook rows' content + sets embedding=NULL. Trigger handles version bump.
- **Embeddings**: backfilled by the existing `embed-knowledge-base` edge function (already runs on rows where `embedding IS NULL` or `embedding_updated_at < scraped_at`). If it's not on a cron, invoke it once post-migration.
- **RLS**: Service-role policy already covers writes; no policy changes needed.
- **No frontend changes** — Fleety pipeline (L1–L6) consumes KB transparently.

## Out of scope

- Scraping the Notion pages live (they're gated; manual narrative is the source).
- Building an admin UI to edit org content (can be a follow-up if you want one).
- Touching the framework://* rows (skills/roles/deliverables) — those are unrelated to org identity.
