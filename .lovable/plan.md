## Why the login page (and the rest of the app) is slow

I profiled the live preview and inspected the build config, root HTML, route graph, and asset folders. The 4s+ Lighthouse score isn't one bug — it's a stack of overlapping costs that compound on 3G / high-latency networks.

### What I measured on `/login`

- **122 resources** loaded just to render a login form (most are dev-mode Vite chunks; production is lighter, but still heavy).
- **Largest shipped JS**: `lucide-react` (158 KB), a Vite vendor chunk (139 KB), `@supabase/supabase-js` (94 KB), `zod` (74 KB) — all pulled into the initial path.
- **Hero image** `hero-space.png` is **125 KB PNG**, preloaded with `fetchpriority="high"` from `/login` even though it's only used on the landing page.
- **`src/assets/` totals ~4.8 MB** of unoptimized PNGs (welcome slides 200–415 KB each, badges 160–270 KB each). `public/images/` has 196 KB and 265 KB SVGs.
- **3 third-party scripts in `<head>`** before our app code: CookieYes (render-blocking), Google Tag Manager, Microsoft Clarity. CookieYes alone forces a synchronous fetch before parsing continues.
- **Google Fonts** loaded from `fonts.googleapis.com` with 7 Inter weights + 4 JetBrains Mono weights = extra round trips.
- **`src/index.css` is 478 lines** and ships as one stylesheet (no critical-CSS split).
- **Eager-imported routes** in `App.tsx`: `Index`, `LoginPage`, `RegisterPage`, `NotFound` — `RegisterPage` (25 KB) is downloaded on `/login` even though the user hasn't clicked "Register" yet.
- **AuthContext + AppLayout + IdleTimeoutGuard + SelfHealingRunner + AnalyticsTracker + RouteChangeReloader + PWAInstallPrompt + OfflineBanner** all mount on every route, including unauthenticated ones.

### Why this hurts on 3G specifically

- 3G effective bandwidth ≈ 400 Kbps, RTT ≈ 400 ms. Every extra request adds ~400 ms of latency before the first byte.
- 1.2 MB of initial JS (gzipped ~350 KB) ≈ **7+ seconds** to download on 3G before parse/execute.
- Render-blocking third-party scripts in `<head>` block FCP for the entire round trip to those CDNs.
- Large unoptimized PNGs dominate LCP on slow links (a 125 KB PNG is ~2.5 s on 3G).

---

## Plan of action

Five phases, ordered by impact-per-effort. Each phase is shippable on its own and measurable with Lighthouse.

### Phase 1 — Critical path (biggest wins, ~1–2 hours)

1. **Defer all third-party scripts.** Move CookieYes, GTM, and Clarity to load after `window.load` (or on first user interaction). They contribute zero to LCP and currently block parsing.
2. **Stop eagerly loading `RegisterPage` and `Index` on `/login`.** Convert them to `lazyWithRetry` like the rest. Keep only `LoginPage` + `NotFound` eager.
3. **Remove the hero-image preload from global `index.html`.** Move that `<link rel="preload">` into the landing page only (via a `useEffect` or `react-helmet`-style head injection), so `/login`, `/dashboard`, etc. don't pay 125 KB they never use.
4. **Tree-shake `lucide-react`.** Audit imports — many components destructure 5+ icons. Use the per-icon import path (`lucide-react/dist/esm/icons/eye`) or switch to `@iconify/react` for on-demand icons. Should drop ~120 KB initial JS.
5. **Reduce font weights.** Drop from 7 Inter weights to 3 (400, 500, 700). JetBrains Mono → 2 weights (400, 600). Saves ~80 KB and 1 fewer connection if we self-host.

**Expected result**: Lighthouse Performance jumps from ~50 → ~80 on `/login`. LCP drops below 2.5 s on Fast 3G.

### Phase 2 — Asset optimization (~1 hour, mostly automated)

1. **Convert all PNGs in `src/assets/` to AVIF + WebP** with PNG fallback via `<picture>`. Welcome slides at 415 KB → ~40 KB AVIF.
2. **Compress the giant SVGs** (`landscape.svg` 196 KB, `quest-tv.svg` 265 KB, `control-center.svg` 84 KB) with SVGO. Typical 60–80% reduction.
3. **Add `loading="lazy"` and explicit `width`/`height`** to every `<img>` outside the LCP element. Prevents layout shift and defers off-screen image fetches.
4. **Generate responsive `srcset`** for hero/welcome images so mobile devices download smaller versions.

**Expected result**: Image payload drops from ~4 MB to ~600 KB across the app. CLS goes to ~0.

### Phase 3 — Bundle splitting + caching (~2 hours)

1. **Split AuthContext lazy work.** AuthProvider currently imports profile sync, OAuth link toast, MFA service, etc. Lazy-load anything not needed before first render.
2. **Move heavy admin-only deps behind admin routes.** AG Grid (v32.3.3 per memory), `react-quill-new`, `recharts`, `d3-geo` should never be in the main chunk for non-admin users. Verify via `vite-bundle-visualizer`.
3. **Add a `framework://` and reference data prefetch only after login**, not on the login page itself.
4. **Self-host fonts** in `/public/fonts/` with `font-display: swap` and `<link rel="preload">` for only the WOFF2 the LCP text uses. Eliminates `fonts.googleapis.com` round trip.
5. **Add long-cache headers** for hashed assets in `public/_headers` (1 year `immutable`). HTML stays no-cache so deploys propagate.

### Phase 4 — Network resilience for slow regions (~1 hour)

1. **Add a tiny inline "shell" CSS in `<head>`** with the `body` background, root spinner, and font fallback so users see something within ~500 ms even on 3G before main CSS arrives.
2. **Preconnect to Supabase** (`iqsjhrhsjlgjiaedzmtz.supabase.co`) so the first auth/data call doesn't pay TLS setup mid-render.
3. **`<link rel="modulepreload">`** the top 2–3 critical chunks (`react-vendor`, `query-vendor`) so they start downloading parallel to the entry script.
4. **Add a "Save Data" path**: detect `navigator.connection.saveData === true` or `effectiveType === 'slow-2g' | '2g'` and skip non-essential image variants, animations, and the Fleety widget on those connections.
5. **Brotli compress the production bundle** (verify the host honors it; Cloudflare does).

### Phase 5 — Site-wide audit + regression guardrails (~1 hour)

1. **Add a Lighthouse CI workflow** (`.github/workflows/lighthouse.yml`) that runs against the published URL on every PR, scoring all top routes:
   - `/`, `/login`, `/register`, `/dashboard`, `/my-journey`, `/courses`, `/resources`, `/applications`, `/admin/system-health`, `/project-openings`
   - Use `lhci` with thresholds: Performance ≥ 80, LCP ≤ 2.5 s, TBT ≤ 200 ms, CLS ≤ 0.1.
   - Run with `--throttlingMethod=devtools --throttling.cpuSlowdownMultiplier=4` (mobile 3G profile) so we catch regressions in the slowest tier.
2. **Publish the per-route baseline as a markdown report artifact** (similar to the existing `a11y-report` workflow) so each page's score is visible over time.
3. **Add a budget file** (`lighthouse-budget.json`): max 250 KB JS, 100 KB CSS, 500 KB images per route. CI fails on regression.

---

## Technical details (for the agent doing the work)

- The eager `Index` + `RegisterPage` imports live in `src/App.tsx` lines 25–28.
- Third-party scripts to defer: `index.html` lines 5–6 (CookieYes), 64–71 (GTM), 73–80 (Clarity).
- Hero preload to remove from global head: `index.html` line 44; replace with per-page injection via `useEffect` in `src/pages/LandingPage.tsx`.
- `lucide-react` deep-import codemod target: every file matching `from "lucide-react"` (currently in 50+ components per `rg`).
- Image conversion: use `sharp` in a one-off `scripts/optimize-images.mjs` that emits `.avif` + `.webp` siblings, then wrap usages in a small `<ResponsiveImage>` component.
- For Save Data mode: thread an `isSlowConnection` boolean through a new `useNetworkQuality()` hook and gate `Fleety`, `PWAInstallPrompt`, large welcome slides behind it.
- Lighthouse CI: `npm i -D @lhci/cli`; run `lhci autorun --collect.url=https://techfleetnetwork.lovable.app/login ...`.

---

## Recommended sequencing

Ship Phase 1 + Phase 2 together as the first PR — that alone should put `/login` at sub-2.5 s LCP on 3G. Phases 3–5 each become their own PR so we can measure the delta and roll back cleanly if anything regresses UX (per the "no UX regression" core rule).

After approval I'll start with Phase 1.
