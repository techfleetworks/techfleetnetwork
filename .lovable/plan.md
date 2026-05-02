
# Auto-Sync Classes to Framer (techfleet.org)

## What you have today
- Framer page at `/overview/current-classes` is a static-feeling page hand-styled in Framer, populated by Airtable through a manual sync.
- Tech Fleet Network is about to become the source of truth for `classes` and `cohorts` (Phase 1 tables already approved in our prior plan, not yet built).
- Goal: Framer reads classes **directly from our DB** with zero manual sync, and you keep full visual control inside Framer.

## The approach (recommended)

Build a tiny **public, read-only JSON API** on Lovable Cloud (one edge function) that returns published classes + their published cohorts. Then drop a **Framer Code Component** on the Current Classes page that fetches that JSON on render and maps each record into Framer-styled cards you control.

Why this shape:
- You keep design 100% in Framer (no iframes, no embeds).
- Edits in Tech Fleet Network show up on techfleet.org within seconds (configurable cache).
- No webhooks, no Airtable, no manual button.
- Safe to expose: only `published` classes/cohorts are returned, no PII.

```text
   ┌─────────────────────┐    publish/edit class
   │ Tech Fleet Network  │──────────────────────┐
   │ (admin UI + DB)     │                      ▼
   └─────────────────────┘            ┌────────────────────┐
                                      │  classes / cohorts │
                                      │  (Postgres + RLS)  │
                                      └────────┬───────────┘
                                               │ SECURITY DEFINER read
                                               ▼
                              ┌──────────────────────────────────┐
                              │  Edge Function: public-classes   │
                              │  GET /functions/v1/public-classes│
                              │  CORS: techfleet.org, framer.*   │
                              │  Cache-Control: s-maxage=60      │
                              └────────┬─────────────────────────┘
                                       │ JSON
                                       ▼
                ┌──────────────────────────────────────────────┐
                │  Framer Code Component <CurrentClasses />    │
                │  fetch() on mount, render Framer-styled grid │
                └──────────────────────────────────────────────┘
```

## What gets built

### 1. Public read endpoint (edge function: `public-classes`)
- Path: `https://<project>.functions.supabase.co/public-classes`
- Method: `GET` only
- Auth: **none** (this is the one explicitly-public endpoint; allowed by the "no unauthenticated endpoints unless explicitly public" rule)
- Returns only: classes with `status = 'published'` and (optionally) `track in ('basic_training','advanced_training')`. Each class includes its **approved + published** cohorts (start_date, end_date, registration_link, seats_remaining if you want it).
- Query params:
  - `?track=basic_training|advanced_training` (filter)
  - `?include=cohorts` (default true)
  - `?limit=` / `?offset=` (pagination, default 50)
- Response shape (stable contract for Framer):
  ```json
  {
    "updated_at": "2026-05-02T12:00:00Z",
    "classes": [
      {
        "id": "uuid",
        "slug": "ux-foundations",
        "title": "UX Foundations",
        "track": "basic_training",
        "summary_html": "...",
        "outcomes": ["..."],
        "audience": "...",
        "skills": ["Figma","Research"],
        "deliverables": ["..."],
        "teacher": { "name": "Jane Doe", "avatar_url": "..." },
        "cover_image_url": "...",
        "next_cohort": { "starts_on":"2026-06-01","ends_on":"2026-07-15","registration_url":"https://..." },
        "cohorts": [ /* same shape, all upcoming approved+published */ ]
      }
    ]
  }
  ```
- CORS: `Access-Control-Allow-Origin` allow-list of `https://techfleet.org`, `https://www.techfleet.org`, `https://framer.com`, `https://*.framer.app` (preview), `https://*.framer.website`.
- Caching: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` so Framer's edge / browser keeps it snappy and the DB barely gets hit.
- Resilience: wrapped in our standard CircuitBreaker with a 1.5 s DB timeout and a stale fallback (returns last-good payload from a `public_classes_cache` row if DB is briefly unavailable). Aligns with our Graceful Degradation rule.

### 2. DB read function (`SECURITY DEFINER`)
- `public.get_public_classes(_track text default null, _limit int default 50, _offset int default 0)` returns the JSON above.
- It is the **only** thing the edge function calls — keeps RLS strict on `classes`/`cohorts` and exposes a vetted projection.
- Ignores anything not `published` and any cohort not `approved + published`.

### 3. Framer Code Component (`CurrentClasses.tsx`)
- Lives in your Framer project under **Assets → Code → New Code File**.
- Single component, copy-paste, no build step.
- Props you can edit in the Framer right panel: `track` (Basic / Advanced / All), `endpoint` (defaulted), `limit`, `showPastCohorts` (bool), `accentColor`, `cardRadius`, `gap`.
- Behavior:
  - `useEffect` → `fetch(endpoint)` on mount, abortable.
  - Renders skeletons while loading (Framer-styled), error state with retry, empty state.
  - Maps each class to a card you style entirely with Framer's normal CSS/Style props — we ship sensible defaults that match the current page (dark card, blue accent, pyramid-style art slot, registration CTA, "Next cohort starts …" label).
- You drop the component on the Current Classes page, swap out the manual Airtable-fed CMS collection, and you're done. New class published → appears within ~60 s.

### 4. Optional: instant invalidation (nice-to-have, not required)
- Add a `pg_notify` trigger on `classes`/`cohorts` UPDATE that calls a small `purge-public-classes-cache` edge function so the 60 s TTL becomes effectively "immediate" right after a publish action. Without it, max staleness is 60 s, which is already a huge upgrade over manual sync.

## Why not the obvious alternatives
- **Airtable two-way sync** — adds a fragile middle layer; you've already been bitten by manual-sync friction.
- **Framer CMS API push** — Framer's CMS API is push-only and rate-limited, and you'd be re-implementing what Postgres already does. You also lose live data; it'd still be a sync.
- **Iframe of a Tech Fleet Network page** — kills your Framer styling control and SEO.
- **Direct Supabase JS in Framer** — works but requires shipping the anon key and trusting RLS in the browser. A purpose-built read endpoint is smaller, faster, and easier to lock down.

## Security & compliance checklist
- Endpoint is GET-only, returns only fields explicitly whitelisted in `get_public_classes`.
- No auth user data, no emails, no draft/archived classes ever leak.
- CORS allow-list (no `*`), `X-Content-Type-Options: nosniff`, rate-limited (per-IP token bucket, 60 req/min) to deter scraping.
- BDD scenarios required (per project rule): publish flow → appears on techfleet.org within TTL; unpublish/archive → gone within TTL; draft never visible; CORS rejects non-allow-listed origin; cache fallback serves stale on DB outage. Each scenario asserts UI + DB + Code/API layers per our BDD Expected Results rule.

## Rollout plan
1. Ship `public-classes` edge function + `get_public_classes` SQL function + `public_classes_cache` fallback table + RLS + BDD scenarios. *(One Lovable build pass.)*
2. Hit the URL in your browser — confirm the JSON looks right.
3. I hand you a ready-to-paste **Framer Code Component** file (with screenshots-matching defaults). You add it to Framer once, set `track`, publish the Framer page.
4. Verify on `techfleet.org/overview/current-classes`. Delete the old Airtable-fed CMS collection.
5. (Optional) Add the pg_notify cache-purge function for near-instant updates.

## Open questions before I build
1. Should the public endpoint include **Basic Training**, **Advanced Training**, or both on the Current Classes page? (default: both, filterable)
2. Do you want **past cohorts hidden** from the public payload? (default: yes, only upcoming + in-progress)
3. Cache TTL: **60 s** (default), 30 s, or do you want the optional instant-invalidation trigger from day one?
4. Should the registration CTA link to the **external registration_url** on the cohort, or to a Tech Fleet Network page like `/classes/<slug>`? (default: external `registration_url`, fall back to slug page if missing)

Answer those four and I'll switch to build mode and ship Phase 1 of this alongside the Teacher/Classes work already in flight.
