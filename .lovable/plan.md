# Stale events on the Events page — root cause + fix

## Diagnosis

There are two tabs on `/events`:

1. **Community Events** — pulls from our `community_events_cache` via the `get-community-events` edge function. I verified live data:
   - Cache: 870 events, oldest `2026-05-12`, newest `2027-05-12`, **0 stale rows**.
   - Read fn enforces a hard 1-day floor (`HARD_FLOOR_MS`).
   - Refresh worker pulls from `techfleetnetwork@gmail.com`'s public ICS with a `PAST_CUTOFF_DAYS = 1` cutoff.
   - This tab is clean.

2. **Public Events** — an `<iframe src="https://luma.com/embed/calendar/cal-Iy1vN2k9O1VcEBC/events">`. Luma is a separate calendar service we don't control; it has its own (years-old) event history and is **not** sourced from `techfleetnetwork@gmail.com`. **This is what's showing years-old events.**

The triple-guard memory rule (`mem://constraints/no-stale-events`) only covers our own pipeline. The Luma embed bypasses it entirely.

## Fix

Remove the Luma iframe and make "Public Events" render from the same `techfleetnetwork@gmail.com` Google Calendar source, so both tabs are guaranteed fresh and identical at the data layer. The two tabs can still differ visually (list vs. grid, or "next 7 days" vs. "next 30 days") but never in source-of-truth.

### Changes

- **`src/pages/EventsPage.tsx`**
  - Delete the Luma iframe block in the `public` tab.
  - Render `CommunityEventList` (or a new `PublicEventList` variant filtered to public/non-internal events) sourced from `get-community-events`.
  - Keep the "Subscribe to all Tech Fleet events" ICS subscribe block — it already points at `techfleetnetwork@gmail.com`.
  - Update tab labels if needed (e.g. "All upcoming" / "This week").

- **No backend changes** — `refresh-community-events` + `get-community-events` already enforce the 1-day floor and source from `techfleetnetwork@gmail.com`.

- **BDD seed** `EVT-STALE-001`: Given the Events page, when either tab loads, then no event with `start_at < now() - 1 day` is visible `[UI]`, the response from `get-community-events` contains zero stale rows `[Code]`, and `community_events_cache` minimum `startUtc >= now() - 1 day` after refresh `[DB]`.

- **Memory** — extend `mem://constraints/no-stale-events` to add a 4th guard: "No external calendar embeds (Luma, etc.) on the Events page — all surfaces must read from `get-community-events`."

### Out of scope

- Re-enabling Luma. If the team wants Luma back later, it must be wrapped in our own filter pass first.
- Authenticated Google Calendar API (current public ICS is sufficient).

### Verification

After shipping:
1. Hard-reload `/events` → both tabs show only events ≥ today.
2. `select min((e->>'startUtc')::timestamptz) from community_events_cache, jsonb_array_elements(events) e` ≥ `now() - 1 day`.
3. No `<iframe src="*luma*">` remains in `EventsPage.tsx`.
