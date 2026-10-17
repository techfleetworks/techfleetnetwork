/**
 * Welcome Flow copy — one place to review/swap every string.
 *
 * These are the APPROVED Figma strings transcribed from the requirements
 * (docs/onboarding/welcome-flow-technical-requirements.md §4.3 / §4.5). They are
 * centralized here (not inlined in JSX) so copy can be confirmed or replaced without
 * touching component logic. Plain data only — no DOM, no React (src/services rules
 * apply by spirit: keep it testable).
 *
 * Reading level ~grade 8, sentence case, verb+object CTAs, no em dashes, no
 * decorative icons in copy (TFN UI conventions, §12.6 / §13).
 */

export const WELCOME_CONTENT = {
  /** Step (a) — Welcome (step (b) "empowered team" folded in, P8). */
  welcome: {
    heading: "Welcome to Tech Fleet's Platform",
    body:
      "Tech Fleet is a public charity nonprofit. We help people develop experience on empowered teams.",
    cta: "Get started",
  },

  /** Step (c) — Why it's helpful. The five items are display-only, not inputs (§4.5). */
  whyItsHelpful: {
    heading: "We prepare you for a changing world",
    items: [
      "Share ownership",
      "Decide together",
      "Practice",
      "Adapt",
      "Build influence",
    ],
  },

  /**
   * Step (e) — Stay Updated (newsletter). Approved copy (§4.7). Switch OFF by default.
   * Double opt-in (P5): never assert "subscribed" — the toggle records intent and the
   * confirmNote points to EO's confirmation email. The consent line names Email Octopus
   * as the subprocessor (P10 — the old "no third parties" line was inaccurate).
   */
  stayUpdated: {
    heading: "Stay Updated",
    toggleLabel:
      "Sign me up for the Tech Fleet newsletter: news, updates, and occasional promotions.",
    consent:
      "You'll get a confirmation email to finish signing up, and you can unsubscribe any time. " +
      "We deliver the newsletter through our email provider, Email Octopus, and share your email " +
      "address with them only for that purpose. We never sell your information or share it for " +
      "anything else.",
    privacyLinkLabel: "Read our privacy policy",
    emailLabel: "The email we will use",
    emailPlaceholder: "[ email from account ]",
    // Shown only once the toggle is on AND the intent was recorded — double opt-in, so we
    // promise a confirmation email, never claim the subscription is complete.
    confirmNote: "Check your inbox to confirm your subscription.",
    // Shown when recording the choice fails, so we never leave a false "you're signed up".
    saveError: "We couldn't save your newsletter choice. Please try again.",
  },

  /**
   * Step (f) — Fill out your profile (§4.8). Prefilled from the existing profile;
   * every field is optional to advance (P11). Field labels map to existing columns.
   */
  profile: {
    heading: "Fill out your profile",
    subhead:
      "We filled this in from your account. Add anything you like, or skip it for now.",
    fields: {
      first_name: "First name",
      last_name: "Last name",
      country: "Country",
      portfolio_url: "Portfolio URL",
      linkedin_url: "LinkedIn URL",
    },
  },

  /**
   * Step (g) — Start onboarding today! (§4.9). The finish screen. Reaching it completes
   * the flow (the set-once write); the nav CTAs appear only once that write is confirmed
   * (FR-g3 — never navigate on an unconfirmed write). Fixed CTAs only (no conditional
   * routing — step d was removed, P9). Buttons are vertically stacked (TFN convention).
   */
  start: {
    heading: "Start onboarding today!",
    body:
      "It's easy to get started. We show you all of the details. Pick one of the options below to begin.",
    finishing: "Finishing your welcome…",
    errorNote: "We couldn't record that you finished the welcome. Please try again.",
    retry: "Try again",
    cta: {
      home: "Take me home",
      discord: "Join Discord",
      onboarding: "Finish onboarding",
    },
  },
} as const;

/** Fixed step-(g) CTA destinations (FR-g1). No conditional d1/d2 routes (P9). */
export const WELCOME_START_ROUTES = {
  home: "/dashboard",
  discord: "/courses/connect-discord",
  onboarding: "/courses/onboarding",
} as const;

/** Shared nav labels (no "Skip" — the flow is un-skippable, §4.2 FR-N2). */
export const WELCOME_NAV = {
  back: "Back",
  next: "Next",
} as const;
