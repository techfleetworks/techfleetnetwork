## Goal

Make Tech Fleet Network 100% compliant with both brand documents (voice/editorial guide + visual guide). The earlier 8 ships covered voice, terminology, basic tokens, typography primitives, auth/email copy, and toast voice. This plan closes the remaining gaps: exact-spec colors, fonts, spacing/grid, iconography rules, illustration families, UX content patterns (modals, dates, tooltips), expanded language guards, imagery direction, and motion standards.

Audience: Tech Fleet members and admins. Out of scope: redesigning core flows, changing the dark-space aesthetic baseline (the guide endorses blues + dark grays), and translating non-English bundles (the i18n auto-translator already does that).

## What's already done (reference, don't redo)

- `docs/brand/{voice-and-tone,editorial-style,ux-copy-patterns}.md`
- ESLint `brand-terms/no-banned-terms` + `scripts/brand/reading-level.mjs`
- `growth` / `graphite` HSL tokens + `--gradient-sage`
- `src/components/ui/typography.tsx` primitives (PageTitle/SectionTitle/SubsectionTitle/Lede/Body/Muted)
- Sentence-case CTAs across auth, ProjectApplicationPage, journey
- Toast voice sweep (UserAdminPage, UpdatesPage, FeedbackPage, EditProfilePage, FleetyChatWidget)
- Email template voice pass (applicant-status, interview-invite, quest-nudge, signup-reminder)
- BDD scenarios BV-001 through BV-007

---

## Phase A — Exact-spec color palette

Brand-guide HEX values are authoritative; current tokens are close but not exact.

- Update `src/index.css` brand tokens to the visual guide's exact HSL equivalents:
  - Deep Space Navy `#01061E` → `--background` (dark) and `--brand-navy`
  - Tech Fleet Blue `#0056A7` → `--primary` (light mode) — replaces current `217 91% 48%`
  - Action Blue `#1863DC` → `--primary-hover` / dark-mode primary — replaces `217 91% 60%`
  - Growth Green `#56A045` → align `--growth` (currently `158 64% 38%`)
  - Alert Orange `#EB4F26` → `--destructive` (currently `0 90% 50%`)
  - Off-White `#F4F4F4` → `--surface-alt`
  - Dark Gray Text `#212121` → `--foreground` (light mode body)
  - Medium Gray `#757575` → `--muted-foreground` floor
- Recompute WCAG contrast for every token pair in light + dark modes; bump lightness only where 4.5:1 fails on body text or 3:1 fails on large text/UI components. Document any divergence inline.
- Add `--brand-mint: #7DD8D0` for Family-2 illustrations (engraving line color).
- Update `tailwind.config.ts` to expose `brand-navy`, `brand-mint`, `surface-alt`, `primary-hover`.
- Add a Storybook-style swatch page at `src/pages/BrandTokensPage.tsx` (admin-only, route `/admin/brand-tokens`) so designers can verify what shipped.

## Phase B — Typography migration to Futura PT + Poppins

Brand guide mandates Futura PT (display) + Poppins (body). We currently ship Inter for everything.

- Self-host Poppins via `@fontsource/poppins` (400/500/600). Futura PT is licensed; ship a free Futura-equivalent (Jost or Spartan) as a swap-in until a license is in place, behind `--font-display`. Document the licensing gap in `docs/brand/typography.md`.
- Update `index.html` preload tags + `src/index.css` `@font-face` blocks; remove the residual `White Rabbit` block unless it's still used for the DOS easter egg (rg first, only delete if unreferenced).
- Update `tailwind.config.ts`:
  - `fontFamily.display = ['"Futura PT"', 'Jost', 'Inter', 'system-ui', ...]`
  - `fontFamily.sans   = ['Poppins', 'Inter', 'system-ui', ...]`
- Rewrite the typography primitives so size/line-height/letter-spacing match the guide table:
  - Display: 4rem / 110% / 1.2em (note: 1.2em letter-spacing is unusual; cap at `tracking-tight ≈ -0.025em` because 1.2em is almost certainly a doc typo and would break readability — record decision in `docs/brand/typography.md`).
  - H1 3rem, H2 2.25rem, H3 1.5rem, H4 1.25rem.
  - Body L 1.125rem, Body 1rem, Body S 0.875rem, Caption 0.75rem.
- Add a codemod-style sweep: ESLint rule `brand-terms/no-raw-heading-sizes` that flags `text-3xl|text-4xl|text-5xl` on `<h1|h2|h3>` and recommends the Typography components.

## Phase C — 4px spacing + 12-column grid tokens

- Add CSS variables `--space-1..--space-16` matching the guide table.
- Extend `tailwind.config.ts` `spacing` to alias these (`space-1: '0.25rem'`, etc.).
- Add ESLint rule `brand-terms/no-arbitrary-spacing` flagging Tailwind arbitrary spacing classes that aren't 4px multiples (e.g. `p-[10px]`, `mt-[15px]`).
- Update `.container-app` utility in `src/index.css` to enforce per-breakpoint outer margins (16/24/32/48px) and gutters.
- Confirm AppLayout containers use the guide's max widths (1200px desktop, 1440px XL).

## Phase D — Iconography + illustration policy

- Codify lucide-react as the canonical icon library (Feather-compatible: 2px outline, rounded caps). Document deviation from the guide's "Feather Icons" line in `docs/brand/icons.md` with rationale (lucide is actively maintained and Feather-derived).
- Standard sizes: 24px UI, 16px in-button. Add `<Icon />` wrapper at `src/components/ui/icon.tsx` enforcing default size + `currentColor` inheritance, plus `aria-hidden` when paired with text and `aria-label` when standalone.
- Sweep imports: replace ad-hoc `className="w-5 h-5"` with `<Icon size="ui|micro">`.
- Create `docs/brand/illustration-system.md` covering Family 1 (Sketch-Fill, Tech Fleet Blue, hatching) and Family 2 (Engraving, brand-mint, fine line). Track illustration backlog in `docs/brand/imagery-backlog.md` (already proposed in Phase 5 of the original plan — execute now).
- Audit `src/assets/*` and `public/images/*`: list every raster, classify as keep/replace, and tag stock-photo replacements as TODO with a placeholder generated from `imagegen` using the new palette.

## Phase E — Modal & confirmation dialog standardization

The guide requires title=action, body=consequences, primary button=action verb (never OK/Yes for destructive ops).

- Audit every `AlertDialog` and `Dialog` in `src/components/**` and `src/pages/**`. List of confirmed offenders to fix:
  - "Are you sure?" titles → action-named titles ("Delete project?", "Leave team?", "Discard changes?")
  - "OK" / "Yes" / "Confirm" buttons → verb+object matching the title
  - Generic "Confirm" → "Delete project", "Remove member", "Publish announcement"
- Build a `ConfirmDialog` wrapper at `src/components/ui/confirm-dialog.tsx` that *requires* `actionLabel` and `consequence` props so future dialogs can't drift.
- Update `EditProfilePage` (delete account), `UserAdminPage` (delete/promote), `BannerManagementPage`, `AdminClassesPage`, `ProjectFormPage`, `UpdatesPage` (delete announcement) to use the new wrapper.

## Phase F — Date, time, tooltip, link patterns

- Centralize date/time formatting:
  - `src/lib/format/date.ts`: `formatDate(d) → "January 15, 2026"`, `formatTime(d, tz) → "2:30 pm EST"`, `formatRange(a, b)` → "October 1 to October 5, 2026". No ordinals, no 24-hour, always include timezone abbreviation when distributed.
  - Replace ad-hoc `date-fns` `format(d, 'MM/dd/yyyy')` callsites with the wrappers (sweep via rg).
- Tooltip rule: extend brand-terms ESLint to flag `<TooltipContent>` children whose string length > 100 chars or that include links/markdown.
- Link-text rule: extend the existing "click here" lint to also flag bare "Read more", "Learn more", "More info", "Here" anchor text (case-insensitive).

## Phase G — Inclusive-language expansion

Add to `scripts/lint/eslint-plugin-brand-terms.mjs` `BANNED` list:
- `\bgirls?\b` (when referring to adult women) → suggest "women" / "people"; allow inside `// brand-allow:` comments for quoted source material.
- `\busers\b` in user-facing JSX/i18n strings → suggest "members" or "people who use the platform". Allow in code identifiers, comments, type names, and `database`/`auth` paths via path-based allow-list.
- `\bblind\b` (when used as adjective) → suggest "person with vision impairment".
- `\bsuffers from\b` (already there — keep).
- Add positive checks: `\bBlack\b` capitalization required when describing race; `\bDeaf\b` capitalization required for the community term — implemented as warnings, not errors, since context is hard to detect.
- Add Team Practices auto-capitalization check: flag lowercase "team practices" in user-facing strings.

## Phase H — Motion standards

- Extend `tailwind.config.ts` with named durations: `duration-quick: 150ms`, `duration-standard: 200ms`, `duration-emphasized: 300ms`.
- Document in `docs/brand/motion.md`: 200–300ms ease-in-out for UI transitions, 800ms+ animations require justification, never use looping animation without `prefers-reduced-motion: no-preference` guard.
- Sweep `animate-` utilities in components for durations >300ms; either justify with a code comment or shorten.

## Phase I — Imagery & illustration sweep

- Generate replacement hero/celebration art via `imagegen` using the sage gradient (Primary Blue → Growth Green) and the engraving style for hero placements.
- Replace any obvious staged stock photos (audit `src/assets/*`, `public/images/*`).
- Every `<img>` must have `alt` describing content + purpose, or `alt=""` when decorative. Add ESLint `jsx-a11y/alt-text` if not already enforced (check `eslint.config.js`).

## Phase J — Guardrails, BDD, verification

- New BDD scenarios (BV-008 through BV-014) covering: exact-color compliance, typography stack, spacing tokens, modal pattern, date/time format, tooltip length, motion duration. Each tri-layered (UI/DB/Code).
- New Playwright suite `e2e/brand/visual.e2e.ts`: screenshots 8 high-traffic routes, asserts computed `font-family` includes Poppins/Futura, computed `--primary` matches Tech Fleet Blue, no `text-[10px]`-style off-grid font sizes.
- Update `mem://index.md` Core: add "Visual baseline = Tech Fleet Brand Visual Guide v1: Tech Fleet Blue #0056A7, Growth Green #56A045, Futura PT display + Poppins body, 4px spacing grid, lucide icons 24/16, sage gradient for celebrations."
- Run `bdd-coverage.ts` to confirm new rows exist; fail CI if any BV-* scenario lacks a tri-layer Then-clause.

## Rollout order

Ship in 6 incremental PRs (each ≤ ~12 files, all CI-green):

1. Phase A (color tokens) + Phase J BDD rows for color
2. Phase B (typography swap)
3. Phase C (spacing/grid) + Phase H (motion)
4. Phase D (icons + illustration policy docs)
5. Phase E (modal standardization) + Phase F (date/time/tooltip/link patterns)
6. Phase G (inclusive language guards) + Phase I (imagery sweep) + final BDD/Playwright wiring

## Technical notes

- WCAG re-check mandatory after Phase A: use `chroma-js` or the existing `pentest/web-http.mjs` to compute contrast ratios for every token pair; block deploy if any fail 4.5:1 / 3:1.
- Futura PT licensing: until a commercial license is procured, the production font stack uses Jost as a free near-equivalent. Note this in `docs/brand/typography.md` and surface as a backlog item, not a blocker.
- Letter-spacing of `1.2em` from the guide is treated as a typo — using `tracking-tight` instead. Recorded as an explicit deviation.
- All edits respect existing constraints: WCAG 2.0/3.0, dark-theme baseline, 100dvh mobile, AG Grid v32.3.3, no PWA, BDD-with-tri-layer-Thens, no UX regression for security/perf code.
- No backend/auth/RLS changes; this is pure frontend + docs + CI tooling.
