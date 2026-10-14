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
    // Shown only once the toggle is on — double opt-in, so we promise a confirmation
    // email, never claim the subscription is complete.
    confirmNote: "Check your inbox to confirm your subscription.",
  },
} as const;

/** Shared nav labels (no "Skip" — the flow is un-skippable, §4.2 FR-N2). */
export const WELCOME_NAV = {
  back: "Back",
  next: "Next",
} as const;
