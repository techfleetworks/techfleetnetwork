## Goal
Replace the flat list with a Google-Calendar-style **week view** for community events, with a list/week toggle, week-based windowed loading, timezone selector, event detail popup, and noise stripping.

## Changes

### 1. Edge function — windowed week loads
`supabase/functions/get-community-events/index.ts`
- Accept `from` and `to` ISO query params (mutually exclusive with `windowDays`, validated via Zod, max 14-day span).
- Return only events overlapping `[from, to]`. Keep existing cache + WAF + rate limit.
- Strip the boilerplate `Learn more about Meet at: https://support.google.com/a/users/answer/9282720` (and any surrounding blank line) from each event's `description` before responding so all clients benefit.

### 2. New `useCommunityEventsWeek(weekStart, tz)` hook
`src/hooks/useCommunityEventsWeek.ts`
- React Query, key = `["community-events", weekStartISO]`.
- `staleTime` 10 min; prefetch next week on success for snappy navigation.
- Calls edge function with `from`/`to` covering Mon 00:00 → next Mon 00:00 in selected tz.

### 3. New `WeekCalendar` component
`src/components/events/WeekCalendar.tsx`
- 7-column grid, Monday → Sunday header with date chips; today highlighted.
- 24-hour timeline column on the left (hour gridlines).
- Absolutely-positioned event blocks computed from `startUtc`/`endUtc` projected into selected tz; horizontal stacking for overlaps.
- All-day strip above the timeline.
- Auto-scroll to 8 AM on mount; "Today" button.
- Prev / Next / Today week navigation; current week label "Nov 10 – Nov 16, 2026".
- Click event block → opens `EventDetailDialog`.
- Keyboard accessible (event blocks are `<button>`s, arrow-key nav between days, focus ring, ARIA roles `grid` / `gridcell`).
- Mobile: collapses to single-day swipeable column with day picker (still windowed by week).

### 4. New `EventDetailDialog`
`src/components/events/EventDetailDialog.tsx`
- shadcn `Dialog`. Shows: title, sanitized description, location, organizer email (mailto), event URL, start/end formatted in selected tz with **timezone abbreviation appended** (e.g. "Mon Nov 10, 2026, 2:00 – 3:00 PM EST").
- Buttons: "Add to Google Calendar", "Join meeting" (if Zoom/Meet/Teams link detected), "Copy link".

### 5. Timezone selector
`src/components/events/TimezoneSelector.tsx`
- Combobox of common IANA zones + search; persisted to `localStorage` (`tfn.events.tz`) for the session.
- Default precedence: localStorage → `profile.timezone` → browser → `America/New_York` (EDT fallback).
- Live region announces tz changes for screen readers.
- Selected tz drives both week view and list view.

### 6. View toggle (Week | List)
`src/pages/EventsPage.tsx`
- Segmented control above the calendar (`ToggleGroup`), default **Week**, persisted in `localStorage` (`tfn.events.view`).
- Week view: `WeekCalendar` (windowed loads).
- List view: existing `CommunityEventList`, updated to accept the selected tz and append tz abbreviation after each time.

### 7. Time formatting helper
`src/lib/events/formatEventTime.ts`
- Add `formatRangeWithZone(startUtc, endUtc, tz)` returning `"2:00 – 3:00 PM EST"` using `Intl.DateTimeFormat` with `timeZoneName: 'short'` extracted once and appended.
- Used by both calendar blocks, list cards, and the dialog.

### 8. Description cleanup
- Edge function strips the Meet boilerplate (single source of truth).
- Frontend sanitizer (`sanitizeHtml`) unchanged.

### 9. BDD scenarios (`bdd_scenarios` table)
Insert via migration:
- View defaults to week, Mon–Sun, current week.
- Prev/Next/Today navigation loads only that week's events.
- Clicking an event opens the detail dialog with all required fields.
- Times render in selected tz with tz abbreviation suffix.
- Profile tz used when no override; EDT fallback when neither set.
- Meet boilerplate removed from descriptions everywhere.
- View toggle persists across reloads.
- Edge function rejects invalid `from`/`to`, > 14-day spans.
- Each scenario has tri-layer Then clauses ([UI]/[DB]/[Code]).

## Out of scope
- Public Events (Luma) tab — unchanged.
- Drag-to-reschedule (read-only calendar).
- Month/day views (only Week + List per request).

## Technical notes
- Week boundaries computed in selected tz using `date-fns-tz` (already pulled in transitively; if not, add `date-fns` + `date-fns-tz`).
- Overlap layout: classic interval-graph coloring → assign each event a column index inside its overlap cluster; width = `100%/clusterSize`.
- Loading skeleton: shimmer overlaying the timeline grid (no layout shift).
- Empty state inside week view: "No events this week — try Next week →".
- Errors keep existing fallback link to Google Calendar.