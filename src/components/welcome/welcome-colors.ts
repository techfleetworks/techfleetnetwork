/**
 * Welcome Flow brand colors, per theme mode. The flow follows the user's light/dark setting
 * (ADR 20261115b); these are the few brand-specific values the DS palette doesn't carry.
 *
 * `panel` = the left branding panel. Light is the owner-specified soft blue (#C2E1FF); dark
 * is a deep slate-blue that keeps the same "quiet branded surface" role on a dark page.
 * `stepDoneFill` = the completed/active stepper node (soft blue in both modes — it reads on
 * a light or dark surface). `stepCheck` = the checkmark, always dark for contrast on the
 * light-blue node. These are intentional brand values, centralized here (not scattered hex).
 */
export const WELCOME_COLORS = {
  panel: { light: "#C2E1FF", dark: "#16263D" },
  stepDoneFill: "#C2E1FF",
  stepCheck: "#01010C",
} as const;
