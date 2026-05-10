# Replace Google Calendar iframe with a custom Tech Fleet event list

## Why this is needed

The embedded Google Calendar iframe is a sealed Google widget. Its event popup, layout, and buttons cannot be customized — there is no API to inject "Add to Google Calendar" buttons into individual events, expose creator email, or control how description/link/timezone are rendered. The only way to deliver everything you asked for (per-event add button, description, link, name, time in viewer's timezone, creator email) is to render our own UI driven by the calendar's underlying iCal feed.

## What you'll see on the Community Events tab

A clean, scannable agenda of upcoming Tech Fleet events. Each event card shows:

- **Event name** (heading)
- **Start → end time** formatted in the viewer's profile timezone (with timezone abbreviation like "EDT") and a relative chip ("Today", "Tomorrow", "in 3 days")
- **Creator email** with a `mailto:` link (the iCal `ORGANIZER` field)
- **Description** (full text, with any URLs auto-linkified, sanitized to prevent XSS)
- **Event link** — the Google Meet / Zoom / location URL pulled from the iCal `LOCATION` or `URL` field, rendered as a prominent "Join event" button when present
- **Add to my Google Calendar** button — uses `https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=…&details=…&location=…` so the viewer adds *this single event* to their personal calendar
- **Copy event link** secondary button

Above the list, the existing "Subscribe to the whole calendar" panel stays (Add to Google Calendar / Copy iCal link / Open in Google) so power-users can still subscribe to everything in one click.

Empty state, loading skeleton, and a graceful error fallback ("Couldn't load events — open the calendar on Google →") are all handled.

## Technical approach

```text
Browser ── GET /functions/v1/get-community-events
                                │
                                ▼
                    fetch public .ics from
            calendar.google.com/calendar/ical/.../public/basic.ics
                                │
                                ▼
                    parse VEVENT blocks → JSON
                                │
                                ▼
                  cache 10 min in edge memory
                                │
                                ▼
                Browser renders custom event list
                (formatted in profile timezone)
```

### Backend — new edge function `get-community-events`

- Public (no JWT required) — calendar is already public, but we still:
  - validate optional `?windowDays=` query param (1–60, default 60) with Zod
  - apply a simple in-memory rate limit (60 req / IP / hour) per the project's edge-function security pattern
  - wrap the upstream fetch in the existing `CircuitBreaker` (per Core memory) with exponential backoff
- Fetches the public `basic.ics` URL, parses `VEVENT` blocks (manual lightweight parser — no external SDK needed; handles `DTSTART`, `DTEND`, `SUMMARY`, `DESCRIPTION`, `LOCATION`, `URL`, `ORGANIZER`, `UID`, recurrence via `RRULE` expansion for the next 60 days)
- Returns JSON: `[{ uid, title, startUtc, endUtc, allDay, description, location, url, organizerEmail }]` filtered to events ending ≥ now and starting ≤ now + windowDays, sorted ascending
- 10-minute `Cache-Control: public, max-age=600` + edge-side memo
- Logs failures to existing error-triage queue (per Core memory), so any iCal feed regression auto-surfaces in System Health → Triage

### Frontend — `EventsPage.tsx`

- Drop the Google Calendar `<iframe>` from the **Community Events** tab
- Add `src/components/events/CommunityEventList.tsx` — fetches via `supabase.functions.invoke('get-community-events')` with React Query (10-min stale time, retry on failure)
- Add `src/components/events/CommunityEventCard.tsx` — renders one event with all fields and the two action buttons
- Add `src/lib/events/googleCalendarTemplate.ts` — pure helper that builds the `calendar/render?action=TEMPLATE` URL given an event (URL-encodes title, ISO-basic dates, sanitized description with link appended, location)
- Add `src/lib/events/formatEventTime.ts` — formats start/end in the user's profile timezone using `Intl.DateTimeFormat` with `timeZoneName: "short"`; handles same-day, multi-day, all-day cases
- Reuse existing `sanitizeHtml` util for description rendering; auto-linkify bare URLs
- Loading skeleton + empty state + error state with a fallback link to the public calendar on Google
- The **Public Events** tab (Luma iframe) is untouched
- Follows the dark space theme, semantic tokens only, fully WCAG 2.0/3.0 (proper headings, ARIA labels on icon buttons, focus rings, time elements use `<time datetime>`)

### Database / migrations

None — the iCal feed is the source of truth, no caching table needed at this volume.

### BDD scenarios (per project rule)

New `bdd_scenarios` rows for feature `events-community-list` covering, with tri-layer Then-clauses (UI / DB-or-cache / Code-API):

1. Loads upcoming events in viewer's profile timezone
2. Falls back to America/New_York when profile timezone unset
3. "Add to Google Calendar" button opens prefilled template URL with the correct event
4. Event link button appears only when LOCATION/URL present
5. Creator email renders as mailto link
6. Edge function returns 400 for invalid `windowDays`
7. Upstream iCal failure surfaces graceful error UI + logs to triage queue
8. Cache-Control header is set to 10 minutes

## Out of scope

- Public Events (Luma) tab — unchanged
- The "Subscribe to the whole calendar" panel — unchanged
- No new connector required (public iCal needs no auth)
- No changes to admin tooling, notifications, or other pages
