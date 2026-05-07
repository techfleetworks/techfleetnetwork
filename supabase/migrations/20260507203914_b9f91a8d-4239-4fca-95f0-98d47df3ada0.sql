INSERT INTO public.bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin) VALUES
('Privacy & Cookies', 1121, 'PRIV-COOKIEYES-GATES-GA4', 'CookieYes gates GA4 + Clarity',
$$Feature: CookieYes consent gating
  Scenario: GA4 and Clarity load only after CookieYes analytics consent
    Given a fresh browser with no cookieyes-consent cookie
    When CookieYes loads and the user clicks Reject all
    Then [UI] no GA4 or Clarity scripts appear in the DOM
    And [Code] applyConsent() denies analytics_storage via gtag consent update
    And [DB] cookie_consents row inserted with analytics=false, source=cookieyes
    When the user later clicks Accept all
    Then [UI] gtag.js and clarity tag elements are appended to <head>
    And [Code] gtag('consent','update',{analytics_storage:'granted'}) is dispatched
    And [DB] new cookie_consents row inserted with analytics=true$$),
('Privacy & Cookies', 1121, 'PRIV-COOKIEYES-GPC-OVERRIDE', 'GPC overrides CookieYes accept',
$$Feature: GPC supremacy
  Scenario: GPC forces analytics off even if CookieYes reports accepted
    Given navigator.globalPrivacyControl is true
    When cookieyes_consent_update fires with accepted=[analytics,advertisement]
    Then [Code] applyConsent() ignores analytics and marketing flags
    And [UI] no GA4/Clarity/DoubleClick request is observed
    And [DB] cookie_consents row stores analytics=false, marketing=false, gpc_signal=true$$),
('Privacy & Cookies', 1121, 'PRIV-COOKIEYES-AUDIT-LOG', 'Server-side consent log mirrors CookieYes',
$$Feature: Auditable consent
  Scenario: Every CookieYes decision is mirrored to cookie_consents via record-consent
    Given the user interacts with the CookieYes banner
    When cookieyes_consent_update fires
    Then [Code] supabase.functions.invoke('record-consent', ...) is called with anon_id, categories, gpc_signal, source='cookieyes'
    And [DB] a row is inserted in cookie_consents matching the payload
    And [UI] no user-visible spinner is introduced$$),
('Privacy & Cookies', 1121, 'PRIV-COOKIEYES-REOPEN', 'Footer Cookie Settings re-opens CookieYes',
$$Feature: User control
  Scenario: Cookie Settings link re-opens the CookieYes preferences modal
    Given a user has previously dismissed the banner
    When the user clicks Cookie Settings in the footer or /cookies page
    Then [Code] window.revisitCkyConsent() is invoked
    And [UI] the CookieYes preferences modal is visible and keyboard-focusable
    When CookieYes is blocked and revisitCkyConsent is undefined
    Then [UI] the user is navigated to /cookies as a fallback$$)
ON CONFLICT (scenario_id) DO UPDATE SET title=EXCLUDED.title, gherkin=EXCLUDED.gherkin, updated_at=now();