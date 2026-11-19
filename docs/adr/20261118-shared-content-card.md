# 20261118 — Shared, theme-aware content card (ContentCard, B9)

- Status: Accepted
- Date: 2026-11-18
- Deciders: product owner (mdenner), engineering
- Ticket: 34c1a3bddce58092864bc1ac090fe335 (public-access), B9 (§6.2)
- Related: 20261118-public-nav-shell (B8, the shell this renders inside);
  20261116-public-visibility-auth-aware (A5 policy the pages bind CTAs to);
  BUILD-PLAN Phase B. Design source: the 2026-11-16 mdenner listing-card redesign
  (Figma file AqnScC6nnGsXUQHWWuL6Lm, UX intent — the platform is shadcn/Tailwind,
  so the Figma MUI frames are translated, not ported).

## Context and problem statement

Phase B needs one listing card that renders a class or a project. The ticket (§6.2)
requires it to be a **shared component used logged-out AND logged-in** — a visitor
and a member see the same card; only the actions differ (a visitor is sent to sign
in, a member gets the real action). Today the live project card is built **inline**
in `ProjectOpeningsPage` (`ProjectSection`, ~90 lines) and nothing reusable exists,
so the public pages (B10/B11) would each hand-roll their own, and the three copies
would drift.

Two constraints shape the choice:
- The real platform is **shadcn/Tailwind**; the Figma redesign is MUI UX-intent, not
  drop-in code. A parallel `src/design-system` (MUI/TFDS) track exists but the live
  public pages use the shadcn `.tf-card` primitive. The card that must serve the live
  pages is the shadcn one.
- The audit (BUILD-PLAN "Shared-component go-live migration") records that swapping
  the live platform's existing cards to the new component for ~767 real users is **its
  own regression-tested step** — so B9 ships the component and its proof, and the live
  logged-in swap is deferred, not folded in here.

## Decision

- **Build `ContentCard` as a purely presentational shadcn/Tailwind component.** It
  takes plain props (title, image, status, meta, chips, blurb, two actions) and
  renders them. It does **not** read auth, route, or fetch. Auth-awareness lives in
  the caller: a public page passes a sign-in redirect-back href as the primary action
  (consuming B8's `loginRedirectHref`); a logged-in page passes the real action. The
  same component therefore serves both audiences with no business rule in the view.
- **Sit on the existing `.tf-card` brand surface.** Light/dark come from the design
  tokens with no per-mode code; the card inherits the platform's established surface
  rather than introducing a second card look. The substantive redesign is the
  **information architecture** (image area + overlaid status badge + title + meta +
  chip row + 2-line blurb + two CTAs pinned to the bottom), per mdenner's redesign.
- **Fill the grid row, do not hardcode a pixel height.** The Figma mock fixes the card
  at ~426px; the build uses `flex h-full flex-col` + `CardFooter mt-auto` so equal-row
  grids align the CTAs while long titles, 200% text zoom, and small screens never clip
  them (universal-accessibility-wcag 1.4.4 / 1.4.10, universal-browser-device-support).
- **Do not make the whole card one big link.** The live inline card is
  `role="link"` wrapping buttons (a nested-interactive a11y violation). ContentCard
  exposes the title and the explicit "view details" / primary buttons as the
  interactive targets instead — a real improvement carried into the shared component.
- **Expose only contrast-safe status tones.** Tones are `success`, `primary`,
  `neutral` — each AA-verified in both light and dark. `info` is excluded (there is
  no `--info` token, so `bg-info` would render nothing and the badge would be
  invisible); `warning` (amber) is excluded because no single foreground passes AA on
  `--warning` (38 92% 50%) in both modes without darkening the global token. A
  contrast-tuned amber "opening soon" tone is a follow-up that first darkens
  `--warning` / adds a dark `--warning-foreground` (a repo-wide token change, out of
  B9 scope); until then callers map "opening soon" to `neutral`.
- **Image alt is compiler-enforced, and a broken URL degrades gracefully.** The image
  props are a discriminated union: supplying `imageUrl` forces `imageAlt` (WCAG 1.1.1,
  not just a doc note). The image area's `bg-muted` wrapper is the placeholder — a
  missing URL or an `onError` (404 / blocked) hides the `<img>` so no broken-image
  glyph shows.

## Pattern-decision record (pattern-selector)

- **Problem / forces:** one card, two audiences, two surfaces (public + logged-in),
  three future callers; must not run auth/data logic in the view; must be theme-aware
  and accessible; must not drift into per-page copies.
- **Pattern chosen:** **Humble Object / Presentational (dumb) component + composition.**
  The card is the humble view; all decisions (which action, which data, which tone)
  are injected by the caller.
- **Candidates considered:**
  - (a) **Presentational card, caller supplies actions** — chosen.
  - (b) A "smart" card that reads auth and builds its own CTAs — rejected: couples the
    view to auth + routing (dependency-direction violation), and the same coupling
    makes it un-reusable across logged-out/logged-in without a branch inside the view.
  - (c) Separate `ClassCard` and `ProjectCard` — rejected: duplicates the shell; §6.2
    asks for one shared card. Class/project differences are just props (chips = track
    vs team hats, blurb = short_description vs description).
- **Pros / cons accepted:** Pro — one component, one surface, reusable across both
  audiences and both entities, no auth in the view. Con — the caller must wire actions
  (acceptable: that is exactly where auth-awareness belongs, and B8 already ships the
  redirect-back builders).
- **Failure / rot prevented:** three drifting inline cards; an auth rule buried in a
  view; a nested-interactive a11y defect; a hardcoded height that clips at zoom.
- **Security trade-off:** none opened — presentational only; Phase A guards the data,
  and the public page (not the card) builds the open-redirect-safe sign-in href.
- **Verify correct application:** vitest — renders title/meta/chips/blurb/status; image
  alt present; href actions render as `<a>` and onClick actions as `<button>`; NO
  nested `role="link"` wrapper; a discriminating case proves the a11y assertion can
  fail. Visual/dark-mode and axe scenarios are `@status:planned` for the B-phase e2e.
- **Real guarantee:** the card is a theme-aware, accessible projection of its props,
  identical across auth states. It does not by itself prove each page wires the
  correct auth-aware action — that is the B10/B11 page work.

## Consequences

- New: `src/components/ContentCard.tsx`, `src/components/content-card.feature`,
  `src/test/ui/ContentCard.test.tsx`.
- B10 (classes) and B11 (projects) render their listings with `ContentCard`, supplying
  auth-aware actions via the B8 builders; B12 may reuse it for the Core-course tiles.
- **Deferred (own regression-tested step, per the audit):** swapping the live
  `ProjectOpeningsPage` inline card (and the logged-in class cards) to `ContentCard`
  for ~767 users. It is a visible redesign for signed-in members and is tracked
  separately so it can be regression-tested and signed off on its own.
- **(F4) Internal navigation uses `onClick`, not `href`.** An `href` action renders a
  plain `<a>`, so an in-app route would full-page reload (vs the inline card's
  `navigate()`). The router is deliberately kept out of this view; B10/B11 pass an
  `onClick` (a router navigate) for in-app targets, and reserve `href` for the sign-in
  redirect-back and other real navigations. If a `Link` render-prop is wanted later it
  can be added without changing this contract.

## Review

judge-arch (fresh context) returned PASS on the four architectural questions
(presentational purity, no auth/router/data imports, correct layering, verified
nested-interactive fix). It raised five a11y/contract findings in the component's own
output; all are resolved here: F1 (invisible `info` tone) and F2 (amber `warning`
below AA) by removing both tones; F3 (broken image) by the `onError` → placeholder
fallback; F5 (unenforced alt) by the discriminated-union props; F4 recorded above.
- Open design items still owed before/through B10–B12 (not blocking B9): the
  `classes.short_description` char cap (proposed 140), class-detail "Schedule" with no
  backing field, footer nav vocabulary.
