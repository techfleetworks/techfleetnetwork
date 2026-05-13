## Plan

1. **Fix the recurring-event parser**
   - Update `refresh-community-events` so RRULE `COUNT` is honored before fast-forwarding.
   - This stops old finite recurring series from 2022–2024 being projected into 2026.
   - Keep the existing no-past-events guards intact.

2. **Add a safer stale-series guard**
   - Add parser-level filtering for recurrence series that ended by `COUNT` or `UNTIL` before the current window.
   - Keep active recurring events and one-off upcoming events.

3. **Validate with real calendar data**
   - Add edge-function tests using representative stale RRULE examples from the live feed.
   - Confirm the API no longer returns old project events like Ruminate, Rewire Neuro, TST4, ADHD Math, Beela, etc. as current events.

4. **Refresh and verify production cache**
   - Deploy `refresh-community-events`.
   - Trigger a refresh.
   - Query `community_events_cache` and `get-community-events` to confirm upcoming results no longer include old finite series.

5. **Store BDD coverage**
   - Add/update BDD scenarios for the Events page calendar feed, including UI, DB, and code/API expected results for stale recurring events.