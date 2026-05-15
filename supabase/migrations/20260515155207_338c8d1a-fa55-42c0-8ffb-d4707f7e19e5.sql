INSERT INTO public.bdd_scenarios
  (feature_area, feature_area_number, scenario_id, title, gherkin, status, test_type, test_file, notes)
VALUES
  ('CSS Universal Browser Support', 1127, 'CSS-COMPAT-011',
   'shadcn Table and Calendar primitives no longer rely on CSS :has()',
   E'Feature: CSS universal browser support\n  Scenario: Firefox ESR <=120 still renders checkbox cells and date ranges correctly\n    Given a user opens an admin Table with checkbox columns or a date-range Calendar on Firefox ESR <=120\n    When the page renders\n    Then [UI] the checkbox cell still has pr-0 spacing and the selected day still shows its rounded background\n    And  [Code] table.tsx applies data-has-checkbox via React.Children inspection and uses data-[has-checkbox=true]:pr-0 instead of [&:has([role=checkbox])]:pr-0\n    And  [Code] calendar.tsx applies day_range_start / day_range_end / day_selected modifier classes to the day button instead of relying on cell-level :has() rules',
   'implemented', 'unit', 'src/test/smoke/css-portability.smoke.test.ts', ''),
  ('CSS Universal Browser Support', 1127, 'CSS-COMPAT-012',
   'Bottom-fixed Fleety launcher clears the iPhone home indicator',
   E'Feature: CSS universal browser support\n  Scenario: Fleety widget never sits under the home indicator on iPhone\n    Given a user opens the app on an iPhone with a home indicator\n    When FleetyChatWidget renders its floating launcher button\n    Then [UI] the launcher sits above the home indicator and home-indicator gestures still work\n    And  [Code] FleetyChatWidget.tsx uses bottom-[max(env(safe-area-inset-bottom),1.5rem)] and right-[max(env(safe-area-inset-right),1.5rem)]',
   'implemented', 'unit', 'src/test/smoke/css-portability.smoke.test.ts', ''),
  ('CSS Universal Browser Support', 1127, 'CSS-COMPAT-013',
   'Custom CSS in index.css uses logical (RTL-safe) padding',
   E'Feature: CSS universal browser support\n  Scenario: Fleety prose lists flip correctly in RTL locales\n    Given a user switches the app to an RTL language (Arabic / Hebrew)\n    When Fleety renders a Markdown list inside .fleety-prose\n    Then [UI] list bullets sit on the right edge with correct inline-start padding (mirrored layout)\n    And  [Code] .fleety-prose ul/ol and li use padding-inline-start instead of padding-left',
   'implemented', 'unit', 'src/test/smoke/css-portability.smoke.test.ts', '')
ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  updated_at = now();