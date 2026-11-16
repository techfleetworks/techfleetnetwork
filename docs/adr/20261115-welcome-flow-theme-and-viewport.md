# 20261115b — Welcome Flow follows the user's theme + fits the viewport

- Status: accepted
- Date: 2026-11-15
- Deciders: owner (mdenner), during live review of the shipped flow
- Amends: ADR 20261115-welcome-flow-prototype-fidelity (reverses its "fixed light theme"
  decision; keeps everything else).

## Context

After the prototype-fidelity rebuild shipped (#499), review on prod surfaced:
1. The flow was pinned to the LIGHT theme; the owner wants it to follow each member's
   light/dark setting.
2. On short viewports the tall illustration pushed the footer "Back / Next" below the fold
   (page scrolled). The nav must always be visible on any device.
3. Brand polish: the left panel should be the brand soft-blue (#C2E1FF), and the stepper's
   completed node should be that blue with a dark check (not a solid black node).

## Decision

1. **Theme-reactive.** Remove the forced-light `ThemeModeProvider`; the flow inherits the
   app's DS theme. Surfaces/text use DS tokens so they flip with the mode. The unDraw
   line-art is black-on-transparent, so in DARK mode each illustration is CSS-inverted
   (`filter: invert(1)`) to stay legible. `ThemeModeProvider` was deleted (its only consumer
   was this flow).
2. **Viewport fit.** The shell is a fixed `100dvh` frame (fallback `100vh`) with
   `overflow: hidden`. The stepper and footer are `flex-shrink: 0` (pinned); only the step
   content is a scroll region (`flex: 1; min-height: 0; overflow-y: auto`). Illustrations are
   capped to a fraction of viewport height (`maxHeight` 24/32/48vh) so they scale down on
   short screens instead of forcing a page scroll. Net: the footer is ALWAYS visible; normal
   devices show no scroll at all; only extreme/short screens scroll the content area (never
   the footer). Honest limit: a content-heavy step (Profile, 6 fields) on a very short
   screen may still scroll its content — by design, the footer stays put.
3. **Brand colors** centralized in `src/components/welcome/welcome-colors.ts`: panel
   `#C2E1FF` (light) / `#16263D` (dark); stepper completed node `#C2E1FF` with a dark check
   (`#01010C`) in both modes, theme-aware ring/connectors. These are intentional brand values
   (the DS palette has no equivalent), kept in one module rather than scattered hex.

Also in this change (owner review nits): more padding under each step heading (Stack spacing
xs:4/md:6 to match the prototype gap); the "Our teams:" label sized to body (was smaller);
fixed the spiral bullet icons (the exported SVG had an empty `<clipPath>` that clipped the
whole icon away).

## Consequences

- Dark-mode members get a native dark onboarding instead of a forced-light surface.
- `filter: invert(1)` suits the monochrome line-art; if future illustrations are multi-color
  they need per-asset handling, not a blanket invert.
- Raw brand hex lives only in `welcome-colors.ts` (documented); the "no raw hex" convention
  stands for everything else.
