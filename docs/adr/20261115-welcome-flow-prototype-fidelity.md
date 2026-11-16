# 20261115 — Welcome Flow rebuilt to the Figma prototype (+ profiles.state)

- Status: accepted
- Date: 2026-11-15
- Deciders: owner (mdenner), via the combined-PR directive
- Supersedes (in part): the §13 "brand only / no greyscale" styling convention for the
  Welcome Flow; the §4.6/P11 "State is not collected" decision in
  `docs/onboarding/welcome-flow-technical-requirements.md`.
- Related: ADR 20261009-welcome-flow-gate, ADR 20261009-welcome-flow-data-model,
  ADR 20261009-welcome-flow-eo-extension, ADR-0017 (EO source of truth), ADR-0026
  (expand/contract), ADR-0036 (schema gate), ADR-0056 (projects column grants — does NOT
  apply to profiles).

## Context

The Welcome Flow screens (PR2/PR3) were built from the *written reconstruction* in the
requirements doc, which had been reconciled against an earlier Figma node (`8770:8597`) with
illustrations left unexported (`src: null`). On review against the actual prototype frames
the owner pointed to — Figma file `AqnScC6nnGsXUQHWWuL6Lm`, page "Welcome Flow", frames
`8873:1342` (Welcome), `8873:1381` (Why it's helpful), `8873:1539` (Stay Updated),
`8873:1442` (Profile), `8873:1484` (Start) — the build diverged on nearly every visual:

- rendered inside the app chrome (sidebar + top bar) instead of full-screen;
- blue branding panel with a tagline instead of a light-gray panel with only the logo;
- a dots stepper pinned to the bottom instead of a check-style stepper at the top;
- no illustrations (the unDraw line-art was never exported);
- the newsletter email field always visible instead of only when the toggle is ON;
- Country as a free-text field instead of a dropdown;
- no State field, which the prototype collects.

## Decision

Rebuild the five screens to the prototype and add the one missing fact:

1. **Full-screen takeover.** `/welcome` renders with no sidebar/header/footer/banners/chat and
   no competing onboarding dialog, via a dedicated branch in `AppLayout` (mirrors the TAL
   full-screen pattern). Security guards (MFA enforcement, admin 2FA grace) and the a11y
   announcer are kept — the takeover never weakens security or accessibility.
2. **Prototype shell.** Light-gray branding panel with the Tech Fleet logo only; a
   decorative check-style top stepper; footer "Back ←" / "Next →" arrow links; the Start
   screen's forward CTA is "Take me home".
3. **Fixed light theme.** The flow is pinned to the design system's LIGHT theme
   (`createAppTheme("light")`) regardless of the member's app theme. The prototype is a light
   branded moment and the unDraw line-art (black strokes, transparent light areas) is only
   legible on a light surface. This **supersedes** the §13 "no greyscale" convention for the
   Welcome Flow: greyscale is expressed through DS theme tokens (`grey.*`, `text.primary`,
   `background.paper`), never raw hex, so the "design system only" mechanical gate still holds.
4. **Illustrations.** The five unDraw SVGs are exported to `src/assets/welcome-flow/`,
   background-stripped, and imported as URLs (never SVGR, §13).
5. **Newsletter email gating.** The email field + confirmation/consent copy appear only once
   the opt-in switch is ON. The committed "Email Octopus is a subprocessor" consent copy is
   kept (it is legally accurate); the prototype's "not shared with any third parties" wording
   is NOT used.
6. **Profile Country + State.** Both are searchable selects over the shared `COUNTRIES` /
   regions lists, writing the same `profiles` columns through `ProfileService.updateFields`.
   This **reverses** the P11 "State not collected" decision: a new nullable `profiles.state`
   column is added (expand-only; row-scoped RLS, so no per-column grant — profiles is not
   column-scoped like projects). State is optional, shown only for countries with a region
   list (US/Canada/Australia today), and cleared when the country changes.

## Consequences

- **Data minimization:** State is additional personal data. It is optional, coarse (no PII
  beyond region), nullable forever, and written only through the allow-listed single owner.
  The DPIA note in §8.7 is updated by this ADR.
- **Dark-mode users** see a light surface for the duration of the flow. Accepted as a branded
  onboarding moment; contrast stays WCAG AA because the light theme's tokens are AA.
- **Schema gate (ADR-0036):** the `state` column must be hand-applied to prod (forward-only,
  idempotent) so the reconciliation gate sees migrations == prod.
- **"Join Discord" Start CTA dropped** to match the prototype (Onboarding course + Take me
  home only).
- The requirements doc and the scoped `src/components/welcome/CLAUDE.md` are updated so the
  mechanical gate, judge-arch, and future work agree with the shipped design.
