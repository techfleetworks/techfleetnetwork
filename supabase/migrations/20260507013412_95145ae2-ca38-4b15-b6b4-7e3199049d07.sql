-- 1. profiles.preferred_language (BCP-47 like "en", "pt-BR", "zh-Hans")
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en';

CREATE OR REPLACE FUNCTION public.validate_bcp47_language()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.preferred_language IS NULL OR NEW.preferred_language = '' THEN
    NEW.preferred_language := 'en';
  END IF;
  IF NEW.preferred_language !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' THEN
    RAISE EXCEPTION 'Invalid BCP-47 language tag: %', NEW.preferred_language;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_profiles_preferred_language ON public.profiles;
CREATE TRIGGER validate_profiles_preferred_language
BEFORE INSERT OR UPDATE OF preferred_language ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_bcp47_language();

-- 2. i18n_translations cache (admin-write, public-read of translated values)
CREATE TABLE IF NOT EXISTS public.i18n_translations (
  locale text NOT NULL,
  namespace text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  source_hash text NOT NULL,
  machine_translated boolean NOT NULL DEFAULT true,
  kb_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (locale, namespace, key)
);

CREATE INDEX IF NOT EXISTS idx_i18n_translations_locale_ns
  ON public.i18n_translations (locale, namespace);

ALTER TABLE public.i18n_translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read translations" ON public.i18n_translations;
CREATE POLICY "Anyone can read translations"
  ON public.i18n_translations FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins manage translations" ON public.i18n_translations;
CREATE POLICY "Admins manage translations"
  ON public.i18n_translations FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS update_i18n_translations_updated_at ON public.i18n_translations;
CREATE TRIGGER update_i18n_translations_updated_at
BEFORE UPDATE ON public.i18n_translations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. accessibility_training_completions
CREATE TABLE IF NOT EXISTS public.accessibility_training_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version text NOT NULL DEFAULT '2026-05-07',
  locale text NOT NULL DEFAULT 'en',
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, version)
);

ALTER TABLE public.accessibility_training_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own training completions"
  ON public.accessibility_training_completions;
CREATE POLICY "Users see own training completions"
  ON public.accessibility_training_completions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users record own training completions"
  ON public.accessibility_training_completions;
CREATE POLICY "Users record own training completions"
  ON public.accessibility_training_completions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins see all training completions"
  ON public.accessibility_training_completions;
CREATE POLICY "Admins see all training completions"
  ON public.accessibility_training_completions FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. Seed BDD scenarios A-01…A-20 (Accessibility feature_area)
INSERT INTO public.bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin)
VALUES
('Accessibility', 30, 'A-01', 'Skip link present on every route',
$g$Feature: Skip link
  Scenario: Tab from start of page
    Given I load any route in the platform
    When I press Tab once
    Then [UI] a visible "Skip to content" link appears at the top of the viewport
    And [Code] AppLayout renders <a href="#main-content" class="skip-link"> before any nav
    And [DB] no DB write occurs$g$),
('Accessibility', 30, 'A-02', 'Focus ring is always visible',
$g$Feature: Focus ring
  Scenario: Keyboard focus on interactive element
    Given I tab to any button or link
    Then [UI] a 2px visible focus ring is rendered using --ring token
    And [Code] no stylesheet sets outline:none without focus-visible replacement
    And [DB] no DB write occurs$g$),
('Accessibility', 30, 'A-03', 'Reduced motion disables animations',
$g$Feature: prefers-reduced-motion
  Scenario: User prefers reduced motion
    Given my OS has prefers-reduced-motion: reduce
    When I navigate the app
    Then [UI] animations and transitions complete in <=1ms (no perceptible motion)
    And [Code] global CSS rule short-circuits *,*::before,*::after animation/transition durations
    And [DB] no DB write occurs$g$),
('Accessibility', 30, 'A-04', 'Forms expose labels and inline error suggestions',
$g$Feature: Accessible forms
  Scenario: Submit invalid form
    Given I submit a form with an invalid field
    Then [UI] inline error appears next to the field with a fix suggestion
    And [Code] every input has a programmatically associated <label for> or aria-labelledby
    And [DB] no row is created for the rejected submission$g$),
('Accessibility', 30, 'A-05', 'Idle warning fires before logout',
$g$Feature: Session timing adjustable
  Scenario: User idle for 28 minutes
    Given I have been idle for 28 minutes
    Then [UI] a dialog warns me and offers a one-click "Stay signed in"
    And [Code] use-idle-timeout fires onWarning at timeoutMs - warningMs
    And [DB] no logout audit row is written until timeoutMs elapses$g$),
('Accessibility', 30, 'A-06', 'TOTP MFA accepts standard authenticator codes',
$g$Feature: Accessible authentication
  Scenario: Sign in with TOTP
    Given I have a TOTP factor enrolled in Google Authenticator
    When I enter the 6-digit code
    Then [UI] sign-in succeeds without biometric or SMS-only paths
    And [Code] mfa.service verifies via supabase.auth.mfa.verify
    And [DB] auth.mfa_challenges row is created and consumed$g$),
('Accessibility', 30, 'A-07', 'Touch targets are at least 24x24 CSS px',
$g$Feature: Target size minimum
  Scenario: Audit interactive elements
    Given the a11y audit runs
    Then [UI] every button, link, and input has bounding box >= 24x24
    And [Code] axe target-size rule + custom DOM probe both pass
    And [DB] a11y_audit row records pass for target-size$g$),
('Accessibility', 30, 'A-08', 'Reflow at 320 CSS px without horizontal scroll',
$g$Feature: Reflow
  Scenario: Resize viewport to 320px
    Given I set viewport width to 320 CSS px
    Then [UI] no horizontal scrollbar appears on any tested route
    And [Code] DOM probe no-horizontal-scroll-at-320 returns pass
    And [DB] a11y_audit row records pass for reflow$g$),
('Accessibility', 30, 'A-09', 'Color contrast meets WCAG AA',
$g$Feature: Contrast
  Scenario: axe contrast check
    Given the a11y audit runs
    Then [UI] all body text has >=4.5:1 contrast and large/UI elements >=3:1
    And [Code] axe color-contrast rule returns no violations
    And [DB] a11y_audit row records pass for contrast$g$),
('Accessibility', 30, 'A-10', 'Live region announces toasts and route changes',
$g$Feature: Status messages
  Scenario: Navigate to new route
    Given I navigate from /dashboard to /journey
    Then [UI] a polite live region announces the new page title
    And [Code] LiveAnnouncer + useAnnounce hook fire on location change
    And [DB] no DB write occurs$g$),
('Accessibility', 30, 'A-11', 'Keyboard shortcuts require modifier or are disablable',
$g$Feature: Character key shortcuts
  Scenario: Audit single-char shortcuts
    Given the a11y static check runs
    Then [UI] every shortcut has a modifier (Ctrl/Meta/Alt) or a user toggle to disable
    And [Code] static check single-char-shortcuts-have-modifier-or-toggle passes
    And [DB] no DB write occurs$g$),
('Accessibility', 30, 'A-12', 'Accessibility statement page reachable from every layout',
$g$Feature: Accessibility statement
  Scenario: Find statement
    Given I am on any page
    Then [UI] the footer contains an "Accessibility" link to /accessibility
    And [Code] AppLayout footer + 404 page + idle dialog all link to /accessibility
    And [DB] no DB write occurs$g$),
('Accessibility', 30, 'A-13', 'Accommodation request reaches admins',
$g$Feature: Accommodation form
  Scenario: Submit request
    Given I fill the accommodation form on /accessibility
    When I submit
    Then [UI] a success toast confirms receipt
    And [Code] feedback service posts category=accessibility, emails info@techfleet.network, posts to Discord
    And [DB] a row is inserted into user_feedback with category='accessibility'$g$),
('Accessibility', 30, 'A-14', 'PDF certificates are PDF/UA tagged',
$g$Feature: Document accessibility - PDF
  Scenario: Generate certificate
    Given a user completes a course
    When the certificate PDF is generated
    Then [UI] downloaded PDF opens with screen-reader friendly reading order
    And [Code] generate-certificate-pdf sets Lang, Title, alt text on logo, tagged headings
    And [DB] certifications row references the generated PDF URL$g$),
('Accessibility', 30, 'A-15', 'DOCX policies use real heading styles',
$g$Feature: Document accessibility - DOCX
  Scenario: Generate policy DOCX
    Given gen-policies.cjs runs
    Then [UI] downloaded DOCX has navigable heading outline in Word
    And [Code] script emits Heading1/Heading2 styles, dc:language, document title
    And [DB] no DB write occurs$g$),
('Accessibility', 30, 'A-16', 'Switching language updates html lang and dir',
$g$Feature: Language switcher
  Scenario: User picks Arabic
    Given I am signed in with preferred_language=en
    When I select Arabic in the language switcher
    Then [UI] <html lang="ar" dir="rtl"> and all visible strings re-render in Arabic
    And [Code] i18next changeLanguage triggers DOM update + react re-render
    And [DB] profiles.preferred_language is updated to 'ar'$g$),
('Accessibility', 30, 'A-17', 'RTL locales mirror layout',
$g$Feature: RTL support
  Scenario: Use Arabic locale
    Given I am viewing the app with lang=ar dir=rtl
    Then [UI] sidebar, breadcrumbs, and chevron icons are mirrored
    And [Code] tailwindcss-rtl variants apply rtl: utilities
    And [DB] no DB write occurs$g$),
('Accessibility', 30, 'A-18', 'Unsupported language triggers AI fallback translator',
$g$Feature: AI translation fallback
  Scenario: User picks Swahili (sw)
    Given the en/common.json bundle is the source of truth
    When I select sw and no static bundle exists
    Then [UI] strings render in Swahili with a "machine-translated" badge in settings
    And [Code] translate-bundle edge fn calls Lovable AI gateway and caches result
    And [DB] i18n_translations rows for (locale=sw, namespace=common) are inserted with machine_translated=true$g$),
('Accessibility', 30, 'A-19', 'Server-side surfaces use preferred_language',
$g$Feature: Server-side locale
  Scenario: Send transactional email to non-English user
    Given my profile has preferred_language='es'
    When the system sends me a notification email
    Then [UI] the email subject and body render in Spanish
    And [Code] email edge fn reads profile.preferred_language and selects locale bundle
    And [DB] notification_log row stores locale='es' alongside the message$g$),
('Accessibility', 30, 'A-20', 'Date and number formatting follow active locale',
$g$Feature: Locale-aware formatting
  Scenario: View dashboard in fr-FR
    Given my preferred_language is fr-FR
    Then [UI] dates display as "07/05/2026" and numbers use space thousands separators
    And [Code] formatDate util passes locale to Intl.DateTimeFormat
    And [DB] no DB write occurs$g$)
ON CONFLICT (scenario_id) DO UPDATE SET
  feature_area = EXCLUDED.feature_area,
  feature_area_number = EXCLUDED.feature_area_number,
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  updated_at = now();