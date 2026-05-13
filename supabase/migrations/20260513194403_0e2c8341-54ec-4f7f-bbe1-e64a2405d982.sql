INSERT INTO public.bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin, status, test_type, notes)
VALUES
  ('Membership', 24, 'MEMBER-MANAGE-001',
   'Starter member sees no Gumroad manage button',
   'Feature: Manage Gumroad subscription from profile

  Scenario: Free Starter member has nothing to manage
    Given a signed-in member whose profiles.membership_tier = ''starter''
    When they open Profile > Membership tab
    Then [UI] CurrentMembershipBanner does not render a "Manage subscription" button
    And  [UI] no tier card shows a "Manage subscription" button
    And  [DB] no profile mutation occurs as a result of viewing this tab
    And  [Code] EditProfilePage passes manageUrl=null to CurrentMembershipBanner for starter tier',
   'implemented', 'manual',
   'Added May 2026 with direct Gumroad manage links.'),

  ('Membership', 24, 'MEMBER-MANAGE-002',
   'Paid member sees Manage subscription on banner and current-tier card',
   'Feature: Manage Gumroad subscription from profile

  Scenario: Community/Professional member can jump to Gumroad
    Given a signed-in member whose profiles.membership_tier IN (''community'', ''professional'')
    And   profiles.membership_sku is set to a Gumroad permalink slug or URL
    When they open Profile > Membership tab
    Then [UI] CurrentMembershipBanner renders a "Manage subscription" button that opens https://app.gumroad.com/d/{slug}/manage in a new tab with rel="noopener noreferrer"
    And  [UI] the current-tier card shows a "Manage subscription" outline button below the "Your Current Plan" badge
    And  [Code] getGumroadManageUrl(profile.membership_sku) returns app.gumroad.com/d/{slug}/manage
    And  [DB] profiles row is unchanged by clicking Manage',
   'implemented', 'manual',
   'Added May 2026 with direct Gumroad manage links.'),

  ('Membership', 24, 'MEMBER-MANAGE-003',
   'Downgrade CTA opens Gumroad manage page instead of toast',
   'Feature: Manage Gumroad subscription from profile

  Scenario: Switching to a lower tier routes through Gumroad
    Given a signed-in Community member viewing the membership tier grid
    When they click "Cancel on Gumroad" on the Starter card or "Switch to Community" on a lower-rank card
    Then [UI] a new tab opens to https://app.gumroad.com/d/{slug}/manage (or app.gumroad.com/library if the SKU cannot be parsed)
    And  [UI] no info toast is shown saying "use the Gumroad email link"
    And  [Code] EditProfilePage onSelect handles action="manage" and action="downgrade" identically by calling window.open with the manage URL
    And  [DB] no profiles update occurs client-side; tier change is driven by the Gumroad webhook only',
   'implemented', 'manual',
   'Added May 2026 with direct Gumroad manage links.'),

  ('Membership', 24, 'MEMBER-MANAGE-004',
   'Gumroad SKU normalization handles slug and full URL',
   'Feature: Manage Gumroad subscription from profile

  Scenario Outline: getGumroadPermalink extracts the slug
    Given a stored membership_sku value of <input>
    When getGumroadPermalink(<input>) is called
    Then [Code] it returns <expected_slug>
    And  [Code] getGumroadManageUrl returns https://app.gumroad.com/d/<expected_slug>/manage when slug is non-null
    And  [Code] getGumroadManageUrl returns https://app.gumroad.com/library when slug is null

    Examples:
      | input                                                    | expected_slug        |
      | "founding-membership"                                    | founding-membership  |
      | "https://techfleet.gumroad.com/l/founding-membership"    | founding-membership  |
      | "https://gumroad.com/l/community?variant=monthly"        | community            |
      | ""                                                       | null                 |
      | "https://evil.example.com/l/founding-membership"         | null                 |',
   'implemented', 'unit',
   'Added May 2026 with direct Gumroad manage links.')
ON CONFLICT (scenario_id) DO NOTHING;