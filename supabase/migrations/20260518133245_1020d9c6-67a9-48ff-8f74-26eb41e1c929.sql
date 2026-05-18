INSERT INTO public.bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin) VALUES
('Global Card Styling', 1128, 'CARD-STYLE-001', 'Every bordered surface uses tf-card style',
$g$Feature: Global card styling
  Scenario: Bordered content surfaces render with tf-card brand style
    Given any page in the app
    When a div uses bg-card or bg-background with a border and rounded-* class
    Then [UI] it renders with asymmetric 40px radius, brand border, and inner glow
    And [DB] no database state changes
    And [Code] the global auto-retrofit CSS rule in src/index.css matches the element$g$),
('Global Card Styling', 1128, 'CARD-STYLE-002', 'Form chrome and menus retain symmetric radius',
$g$Feature: Global card styling
  Scenario: Inputs, popovers, menus, dialogs, dropdowns keep usability-focused shape
    Given a form input, dropdown menu, popover, select content, or toast
    When rendered on any page
    Then [UI] it keeps its standard radius and never gets tf-card asymmetric corners
    And [DB] no database state changes
    And [Code] the auto-retrofit selector excludes role=menu/dialog/listbox/tooltip/combobox/tab/tabpanel/status/alert plus Radix popper descendants and sonner toasts$g$),
('Global Card Styling', 1128, 'CARD-STYLE-003', 'data-no-card escape hatch disables auto-styling',
$g$Feature: Global card styling
  Scenario: Explicit opt-out for edge-case containers
    Given a bordered container that must not look like a card
    When the author adds data-no-card to the element
    Then [UI] the container keeps its original rounded/border styling
    And [DB] no database state changes
    And [Code] :not([data-no-card]) clause in src/index.css skips the element$g$),
('Global Card Styling', 1128, 'CARD-STYLE-004', 'Card variants render compact and muted forms',
$g$Feature: Global card styling
  Scenario: Card primitive supports muted and compact variants
    Given a Card component
    When rendered with variant=muted or variant=compact
    Then [UI] muted uses muted-tinted background; compact uses 24px asymmetric radius
    And [DB] no database state changes
    And [Code] src/components/ui/card.tsx applies tf-card--muted and tf-card--compact classes$g$)
ON CONFLICT (scenario_id) DO UPDATE SET gherkin = EXCLUDED.gherkin, title = EXCLUDED.title;