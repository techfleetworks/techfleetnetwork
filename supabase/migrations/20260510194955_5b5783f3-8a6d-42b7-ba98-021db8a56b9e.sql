-- Backfill announcements: decode &amp;nbsp; → space, &nbsp; → space, U+00A0 → space.
UPDATE public.announcements
SET body_html = regexp_replace(
  regexp_replace(
    regexp_replace(
      regexp_replace(body_html, '&amp;nbsp;', ' ', 'gi'),
      '&amp;#39;', '''', 'gi'
    ),
    '&nbsp;', ' ', 'gi'
  ),
  E'\u00A0', ' ', 'g'
)
WHERE body_html ~* '(&amp;nbsp;|&nbsp;|\u00A0|&amp;#39;)';

-- Backfill notifications too (same source: rich-text editor / pasted content).
UPDATE public.notifications
SET body_html = regexp_replace(
  regexp_replace(
    regexp_replace(
      regexp_replace(body_html, '&amp;nbsp;', ' ', 'gi'),
      '&amp;#39;', '''', 'gi'
    ),
    '&nbsp;', ' ', 'gi'
  ),
  E'\u00A0', ' ', 'g'
)
WHERE body_html IS NOT NULL
  AND body_html ~* '(&amp;nbsp;|&nbsp;|\u00A0|&amp;#39;)';

INSERT INTO public.bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin, status, test_type, notes)
SELECT 'Announcements', 23, 'ANN-NBSP-001',
  'Non-breaking-space noise is normalized in rich-text content',
  'Feature: Readable announcement body text

  Scenario: Pasted/double-escaped &nbsp; is normalized
    Given an admin pastes content from Google Docs/Word containing &nbsp; or &amp;nbsp;
    When the announcement is saved or rendered
    Then [Code] normalizeRichTextHtml replaces &amp;nbsp;, &nbsp;, and U+00A0 with regular spaces
    And  [DB] no announcements.body_html row contains "&nbsp;" or "&amp;nbsp;" after backfill
    And  [UI] AnnouncementBanner / NotificationBell / UpdatesPage render natural-wrapping text without literal "nbsp" tokens',
  'implemented', 'unit',
  'Added May 2026 to fix literal &nbsp; appearing in newest announcement.'
WHERE NOT EXISTS (SELECT 1 FROM public.bdd_scenarios WHERE scenario_id='ANN-NBSP-001');