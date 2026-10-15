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
} as const;

/** Shared nav labels (no "Skip" — the flow is un-skippable, §4.2 FR-N2). */
export const WELCOME_NAV = {
  back: "Back",
  next: "Next",
} as const;
