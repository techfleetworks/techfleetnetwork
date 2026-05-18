# Core Web Vitals remediation plan

Worst offenders from RUM: **CLS poor on /dashboard, /login, /project-openings/*, admin roster (0.33–0.99)**, **LCP poor 5–10s on the same pages**, **FCP needs-work on /login, /dashboard, /admin/roster**, **INP poor 624ms p75 on /courses/onboarding**. Mobile Chrome and slow desktops are dragging averages down.

Fix in five focused passes. Each pass is independently shippable and instrumented through the existing Web Vitals RUM so we can verify the move in 7 days.

## 1. Kill CLS (biggest, ugliest number)

Layout shift comes from late-arriving fonts, images without intrinsic size, skeletons that don't match final size, and toast/banner/cookie consent injecting above the fold.

- Add `size-adjust`, `ascent-override`, `descent-override`, `line-gap-override` to `@font-face` for Inter + JetBrains Mono in `public/fonts/fonts.css` to eliminate FOUT shift. Add `font-display: optional` on body font and `swap` only on display fonts.
- Audit every `<img>` and `<Avatar>` in `LandingPage`, `LoginPage`, `DashboardPage`, `ProjectOpeningDetailPage`, `ProjectOpeningsPage`, `RosterProjectDetailPage`: enforce explicit `width`/`height` attributes (or fixed Tailwind sizes) and `aspect-ratio` on hero/illustration containers. Replace any `<img>` missing dimensions with a sized wrapper.
- Reserve space for **CookieConsentBanner** and **AnnouncementBanner** (top-mounted): give the layout shell a CSS variable `--banner-h` set on mount, applied as `padding-top` so the page does not jump when banner renders.
- Reserve space for the **dashboard widgets**: replace variable-height Suspense skeletons with fixed `min-h` matching the rendered widget (e.g. `Skeleton h-[400px]` already exists for one; apply same to all `my_project_apps`, `quests`, `network activity`, `announcements` widgets).
- Reserve space for the **login hero** illustration and the **project opening detail** cover image with `aspect-ratio` wrappers.
- Toasts: ensure Sonner mounts in a fixed-position container that does not push content (already top-center fixed — verify no `space-y` parent is shifting).
- Defer Clarity/GA injection until after first paint (already gated by consent; double-check the consent banner itself doesn't shift).

## 2. Cut LCP on /dashboard, /login, project pages (5–10s → <2.5s)

LCP element on these pages is typically a hero image, the first widget card, or a heading blocked behind a large JS chunk.

- Identify LCP element per route via the existing `web_vital_samples.lcp_element` field (already captured). For each:
  - Hero images → convert to **AVIF + WebP** via `vite-imagetools`, mark with `fetchpriority="high"`, `decoding="async"`, `loading="eager"` only for LCP, `lazy` for everything below the fold.
  - Add `<link rel="preload" as="image" href="…" fetchpriority="high">` in `index.html` for landing/login hero (single preload per route handled via a tiny route-aware head manager, or hardcode the login hero since /login is the highest-traffic page).
- **Login page**: the Google logo and Cloudflare Turnstile widget are likely deferring LCP. Move Turnstile to lazy mount after the form is interactive; render the email/password form synchronously so the H1 + form become LCP candidates (text LCP renders ~600ms faster than image).
- **Dashboard**: today every widget loads in parallel and competes for bandwidth. Render the H1 + welcome card synchronously, then mount widget grid via `Suspense` + `React.lazy` (already partially done). Prioritize `my_project_apps` and `announcements`; defer `network_activity`, `quests`, `events` to `requestIdleCallback`.
- **Project opening detail**: preload the cover image from the route loader; render title + apply CTA above the fold without waiting for the description fetch.
- **Roster project detail**: AG Grid is the LCP. Render the page header + applicant count summary synchronously; mount the grid lazy under a fixed-height skeleton (matches CLS fix above). AG Grid is already isolated in `aggrid-vendor` chunk — verify it's not eagerly imported anywhere.

## 3. Cut FCP (2.5–3.5s p75 → <1.8s)

FCP is paint-blocked by initial JS. The bundle is already split, but the **critical path on /login is too heavy** because LoginPage is eagerly imported.

- Keep LoginPage eager (it's the entry), but **dynamic-import** everything LoginPage doesn't need for first paint: Turnstile, Google OAuth SDK, password-strength meter, MFA flow.
- Remove `installSessionActivityTracker()` from module top-level if it does any sync work; defer to `requestIdleCallback`.
- Audit `src/App.tsx` eager imports: `AuthRedirectHandler`, `SelfHealingRunner`, `AnalyticsTracker`, `RouteChangeReloader`, `OfflineBanner`, `IdleTimeoutGuard` — move any non-critical to lazy/idle mount.
- Inline critical CSS for the app shell (header + login form skeleton) into `index.html` via a small Vite plugin so first paint doesn't wait for `index.css` parse.
- `<link rel="preload" as="font">` is already on inter-var — add the same for the headings font if it's used above the fold.

## 4. Cut INP on /courses/onboarding (624ms p75 → <200ms)

Onboarding course player likely runs a heavy render on lesson change.

- Profile with `browser--start_profiling` against `/courses/onboarding` clicking through lessons; identify the long task.
- Likely fixes: wrap lesson-content transition in `startTransition`, memoize the lesson list, virtualize the side rail if >50 lessons, debounce progress-save POSTs to 300ms with leading-edge.
- Same audit on `/courses/discord-learning` (272ms p75).

## 5. TTFB (1.0–1.5s p75 → <800ms)

TTFB is partly Lovable Cloud cold paths. Two things we can do from app code:

- Add `<link rel="preconnect">` for `accounts.google.com` and `challenges.cloudflare.com` (Supabase already preconnected). Done in `index.html`.
- For `/admin/roster/project/*` and `/project-openings/*`, the page issues 3–6 sequential queries. Convert to a single Postgres RPC that returns project + applicants + agreement status in one round-trip. Already a pattern in this codebase per the architecture memory.
- Server-side: if TTFB stays high on admin routes after batching, recommend the user upgrade Lovable Cloud instance size (per the compute-performance runbook) — flag in the closing note, do not auto-do.

## BDD coverage (required by project rule)

Add `bdd_scenarios` entries `PERF-CWV-001..010` covering tri-layer assertions: CLS budget per route, LCP element preload presence in HTML head, FCP budget enforced via Lighthouse CI, INP budget on lesson-change action, RUM beacon writes `web_vital_samples` row with rating.

## Files to touch

```text
public/fonts/fonts.css            — font metric overrides
index.html                        — preload hero, preconnect, critical CSS
vite.config.ts                    — add vite-imagetools, critical-css plugin
src/App.tsx                       — defer non-critical providers
src/pages/LoginPage.tsx           — lazy Turnstile/OAuth, sized hero
src/pages/DashboardPage.tsx       — fixed widget skeletons, idle-mount low-pri
src/pages/ProjectOpeningDetailPage.tsx  — sized cover, preload
src/pages/ProjectOpeningsPage.tsx — sized cards
src/pages/RosterProjectDetailPage.tsx   — synchronous header, lazy grid
src/components/AppLayout.tsx      — --banner-h CSS var
src/components/CookieConsentBanner.tsx  — reserve height
src/components/announcement-banner — reserve height
src/pages/DiscordCoursePage.tsx
src/pages/OnboardingCoursePage (or wherever /courses/onboarding lives)
src/components/web-vitals/*       — extend reporter with lcp_element tag
supabase/migrations/<ts>_perf_rpcs.sql — combined project+roster RPCs
```

## Verification

- Run `browser--performance_profile` against /login, /dashboard, /admin/roster/project/[id], /project-openings/[id] before and after each pass.
- Watch `web_vital_samples` for 7 days; targets: CLS p75 ≤ 0.10, LCP p75 ≤ 2.5s, FCP p75 ≤ 1.8s, INP p75 ≤ 200ms, TTFB p75 ≤ 800ms.
- Lighthouse CI added to repo with route-level budgets matching the targets above.

Approve and I'll ship all five passes plus BDD + verification in one go.
