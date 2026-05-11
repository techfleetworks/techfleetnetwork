UPDATE public.community_events_cache
SET etag = NULL, last_modified = NULL, updated_at = now()
WHERE id = 1;

INSERT INTO public.bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin, status, test_type)
VALUES
('events-week-view', 9, 'EWV-009', 'TZID-bound DTSTART keeps intended local time',
$$Feature: Events Week View — TZID-bound DTSTART keeps intended local time
  Scenario: An ICS event with DTSTART;TZID=America/Los_Angeles:20260601T090000 renders at 9 AM Pacific
    Given the community ICS contains a VEVENT with "DTSTART;TZID=America/Los_Angeles:20260601T090000"
    When refresh-community-events parses and caches the event
    Then [Code] the cached startUtc equals "2026-06-01T16:00:00.000Z" (9 AM PDT in UTC)
    And [DB] community_events_cache.events[].startUtc reflects the TZID-converted UTC instant, not raw 09:00Z
    And [UI] WeekCalendar displays the event at the 9 AM row in America/Los_Angeles (not 1 AM)$$,
'not_built', 'e2e'),
('events-week-view', 10, 'EWV-010', 'Stale events never render in Week or List views',
$$Feature: Events Page — stale-event triple guard
  Scenario: A poisoned client cache returns events older than 1 day
    Given useCommunityEventsWeek / useQuery returns a CommunityEvent with startUtc = now() - 30 days
    When the user opens the Events page
    Then [UI] WeekCalendar's positioned[] excludes that event (HARD_FLOOR = now - 1d)
    And [UI] CommunityEventList does not render a card for that event
    And [Code] both views apply Date.parse(startUtc) >= Date.now() - 86_400_000 before render$$,
'not_built', 'e2e'),
('events-week-view', 11, 'EWV-011', 'WeekCalendar refDate is clamped on mount',
$$Feature: Events Week View — refDate clamping
  Scenario: HMR / persisted state leaves refDate two years in the past
    Given WeekCalendar mounts with refDate that resolves to a weekStart < currentWeekStart
    When the clamp effect runs
    Then [Code] setRefDate(new Date()) is called and refDate snaps to the current week
    And [UI] the "Previous week" button is disabled and the visible label shows the current week
    And [DB] no read against community_events_cache uses an out-of-bounds week range$$,
'not_built', 'e2e')
ON CONFLICT DO NOTHING;