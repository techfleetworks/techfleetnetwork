# CSS Universality Audit — Findings + Fix Plan

Scope: every CSS-affecting pattern in `src/` was scanned for cross-browser/cross-device portability gaps. This sits between Phase 1 (browser support contract) and Phase 2 (CSS portability sweep) of the parent plan.

---

## What I scanned + raw counts

| Pattern | Count | Status |
|---|---|---|
| `100vh` | 13 | ❌ iOS Safari URL-bar bug |
| `100dvh` | 7 | ✅ correct |
| `h-screen` / `min-h-screen` (Tailwind = `100vh`) | 6 | ❌ same bug |
| `:has(…)` in JSX/CSS | 3 | ⚠️ Firefox <121, FF ESR 115 broken |
| `backdrop-blur` / `backdrop-filter` | 6 | 4 guarded with `supports-[backdrop-filter]:`, **2 unguarded** |
| `sticky top-…` headers | 11 | ✅ |
| `gap-N` in flex | 991 | ⚠️ Safari <14.1 no flex-gap |
| `aspect-…` | 13 | ✅ Safari 15+ |
| `env(safe-area-inset-*)` | 3 | ❌ should be ~15+ surfaces |
| `overscroll-contain` | 3 | ⚠️ should be on every modal/sheet |
| `scroll-padding` / `scroll-snap` | 0 | ⚠️ keyboard nav lands under sticky headers |
| `-webkit-overflow-scrolling: touch` | 0 | ⚠️ jerky momentum scroll on iOS <13 |
| `-webkit-tap-highlight-color` | 0 | ⚠️ blue tap flash on iOS |
| `text-size-adjust: 100%` | 0 | ❌ iOS landscape auto-zoom |
| `@supports` blocks | 0 | ❌ no progressive enhancement |
| Logical props (`*-inline-*`) | 0 | ⚠️ RTL ships per memory but uses physical properties |
| `oklch`/`oklab`/`conic-gradient`/`color-mix` | 0 | ✅ |
| `text-wrap: balance` | 0 | ✅ (no risky uses) |
| `font-display: swap` | 5 | ✅ |
| `prefers-reduced-motion` | 2 (App.css + index.css) | ✅ honored |
| `container-app` class name | 75 | ℹ️ this is a layout utility, **not** CSS `@container` queries — naming is misleading but no compat issue |

---

## Specific defects worth fixing

### D1 — Viewport height: 13 × `100vh` + 6 × `h-screen` clip layouts on iOS Safari
Affects every auth page, FeedbackPage iframe, ProjectApplicationStatusPage scrollers, AppLayout overlay, ProjectAnalysisContent and ExploreTab scroll areas.
**Fix**: codemod `100vh` → `100dvh`, replace `h-screen`/`min-h-screen` with `h-dvh`/`min-h-dvh` (custom utility), `@supports not (height: 100dvh) { … 100vh fallback }`.

### D2 — `:has()` in shadcn `Table` (rows 49, 60) and `Calendar` (row 31)
Firefox ESR 115 (still in many enterprise environments) silently ignores the rule, so checkbox cells lose padding and selected calendar days lose their range/round-corner styling.
**Fix**: replace `[&:has([role=checkbox])]:pr-0` with React-applied `data-has-checkbox` attribute on the cell; same trick for calendar selection state via react-day-picker's existing `data-*` attributes.

### D3 — Two unguarded `backdrop-blur` in `GenericCoursePage.tsx` (lines 754, 879)
Firefox supports `backdrop-filter` since 103, but on older Android WebView and Samsung Internet ≤14 the header becomes fully transparent (text overlaps content underneath).
**Fix**: add `supports-[backdrop-filter]:bg-background/80` pattern matching the rest of the codebase, or wrap with `@supports (backdrop-filter: blur(8px))`.

### D4 — Safe-area coverage gaps
Only `GenericCoursePage` and `ProfileSetupDialog` honor the iPhone notch/home indicator. Missing on:
- `AppLayout` top bar, `FlowMobileNav`, sidebar Sheet
- Toast container (toasts hide behind home indicator on iPhone landscape)
- `CookieConsentBanner` (sits over home indicator)
- Sticky form footers in dialogs (Project application, Class form, Profile edit)
- Fleety chat widget
**Fix**: add Tailwind utilities `pt-safe`, `pb-safe`, `pl-safe`, `pr-safe` in `tailwind.config.ts` and apply across the surfaces above.

### D5 — Missing global mobile baseline
`html`/`body` lack three iOS/Android polish lines that should be in `index.css` `@layer base`:
```css
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body { -webkit-tap-highlight-color: transparent; }
* { -webkit-overflow-scrolling: touch; }
```
Without these: iOS rotates and zooms text, every tap flashes a blue rectangle, and any nested scroll container stutters on iOS <13.

### D6 — `overscroll-behavior` only set in 3 places
Modal/Sheet/Dialog scrolls bleed into the page underneath on iOS — pull-to-refresh fires inside dialogs.
**Fix**: add `overscroll-contain` to all `Dialog`, `Sheet`, `Drawer`, `Popover`, `ScrollArea` primitives globally.

### D7 — `scroll-padding-top` not set
With sticky headers at 64px, in-page anchor links and keyboard tab navigation land **under** the header.
**Fix**: `html { scroll-padding-top: 5rem; }` plus `scroll-margin-top: 5rem` on heading utilities.

### D8 — Logical properties absent despite shipped RTL
Memory says i18n + RTL ships, but code uses `pl-*`/`pr-*`/`left-*`/`right-*` everywhere. Tailwind's RTL plugin maps these via `dir`, but custom CSS in `index.css` (8 occurrences of `left:`/`right:`) won't flip.
**Fix**: convert custom CSS to logical properties (`inset-inline-start` etc.) and audit any one-off positional styles.

### D9 — `gap-N` everywhere — verified safe but pin the floor
Flex `gap` requires Safari 14.1+ (Apr 2021). Browser support contract should hard-floor Safari ≥ 14.1; iOS 14.0 users (a small minority on older iPhones) see collapsed layouts everywhere.
**Fix**: declare in `browserslist` and surface a single "browser too old" notice if `CSS.supports('gap', '1px') === false` and the user is in Flex contexts.

### D10 — No `@supports` progressive enhancement anywhere
Zero `@supports` blocks means we have no graceful fallbacks for any of the above. Every modern feature is used unconditionally.
**Fix**: introduce a small "feature shim" CSS block in `index.css` that supplies fallbacks for `dvh`, `:has()`, `backdrop-filter`, and `aspect-ratio`.

---

## Fix plan (additive to parent CSS plan)

### A. One-shot codemod (script, then commit)
- `scripts/migrate/css-portability.mjs`:
  - Rewrite `100vh` → `100dvh`, `h-screen` → `h-dvh`, `min-h-screen` → `min-h-dvh` across `src/**/*.{ts,tsx,css}`.
  - Inject `supports-[backdrop-filter]:bg-background/80` on the 2 unguarded `backdrop-blur` sites.
  - Add `overscroll-contain` to every `ScrollArea`, `DialogContent`, `SheetContent`, `DrawerContent`, `PopoverContent` in shadcn primitives once at source.

### B. New utility classes in `tailwind.config.ts`
```ts
spacing: {
  'safe-t': 'env(safe-area-inset-top)',
  'safe-b': 'env(safe-area-inset-bottom)',
  'safe-l': 'env(safe-area-inset-left)',
  'safe-r': 'env(safe-area-inset-right)',
},
height:    { 'dvh': '100dvh', 'svh': '100svh', 'lvh': '100lvh' },
minHeight: { 'dvh': '100dvh' },
maxHeight: { 'dvh': '100dvh' },
```
Plus shortcut classes `.pt-safe`, `.pb-safe`, `.pl-safe`, `.pr-safe`.

### C. Global baseline added to `src/index.css` `@layer base`
```css
html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  scroll-padding-top: 5rem;
}
body {
  -webkit-tap-highlight-color: transparent;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
@supports not (height: 100dvh) {
  .min-h-dvh { min-height: 100vh; }
  .h-dvh    { height: 100vh; }
}
@supports not selector(:has(*)) {
  /* fallback styles for table + calendar emitted by codemod */
}
```

### D. shadcn primitives: replace `:has()` selectors
- `src/components/ui/table.tsx`: cell components inspect children for a checkbox and apply `data-has-checkbox`; CSS becomes `[data-has-checkbox]:pr-0`.
- `src/components/ui/calendar.tsx`: rely on react-day-picker's built-in `data-selected`, `data-range-end`, `data-outside` attributes already exposed; remove `[&:has([aria-selected])]` selectors.

### E. Safe-area apply pass
Add `pt-safe`/`pb-safe` to these specific files:
1. `src/components/AppLayout.tsx` lines 156, 279, 333 (sticky headers → `pt-safe`)
2. `src/components/FlowMobileNav.tsx` line 14 (`pt-safe`)
3. `src/components/ui/toaster.tsx` viewport (`pt-safe pb-safe`)
4. `src/components/CookieConsentBanner.tsx` (`pb-safe pl-safe pr-safe`)
5. `src/components/ProfileSetupDialog.tsx` already done — verify
6. `src/pages/EditProfilePage.tsx` line 298 sticky bar (`pt-safe`)
7. `src/components/FleetyWidget.tsx` (whichever file) bottom-fixed (`pb-safe`)

### F. RTL audit
- Run `rg "left-|right-|pl-|pr-|ml-|mr-|border-l|border-r|rounded-l|rounded-r" src/**/*.css` — convert any in plain CSS files to logical properties; Tailwind utilities flip automatically with the `tailwindcss-logical` plugin or `dir`-aware variants (already wired per project memory — verify).

### G. Smoke + visual regression
- Add `src/test/smoke/css-portability.smoke.test.ts`:
  - Asserts `index.css` contains `text-size-adjust`, `tap-highlight-color`, `scroll-padding-top`, the `@supports not (height: 100dvh)` block, and the safe-area utilities.
  - Greps `src/**/*.{ts,tsx}` for forbidden patterns: `100vh`, `h-screen`, unguarded `backdrop-blur` (no `supports-` prefix on the same className).
- Add 8-shot Playwright visual snapshot at iPhone 13, Pixel 7, iPad, MBP 14 in Chromium/WebKit/Firefox covering: `/`, `/login`, `/dashboard`, `/journey`, `/training`, `/admin`, `/feedback`, `/cookies`. Snapshot diffs gate the PR.

---

## Severity-ranked rollout order

1. **D1 + D5** — visible to every iPhone user today (clipped layouts, blue tap flashes, landscape zoom). Ship first.
2. **D2** — silent visual breakage on FF ESR; ship with D1.
3. **D4 + D6 + D7** — accessibility + iPhone polish; ship together.
4. **D3 + D10** — old-Android resilience; ship together.
5. **D8 + RTL audit** — needed before next translated-language launch.
6. **G** — lock in regressions for the next contributor.

---

## Deliverables
- Codemod script + diff (auto-applied)
- `tailwind.config.ts` utilities update
- `index.css` global baseline + `@supports` shims
- `Table`/`Calendar` `:has()` removal
- Safe-area apply pass on 7 files
- BDD scenario `CSS-COMPAT-001..010` rows in `bdd_scenarios` (tri-layer per memory)
- Smoke + Playwright visual harness wired into CI

After this lands, no per-page CSS class can opt out of cross-browser correctness — the global baseline + Tailwind utilities + smoke greps make portability the default.
