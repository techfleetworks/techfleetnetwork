# Cross-browser testing hardening — 4-track plan

Ship all four tracks. Each track is self-contained, gated by its own BDD scenarios (tri-layer Then), and wired into existing CI workflows (`cross-browser.yml`, `regression.yml`, `lighthouse.yml`). No UX regressions — all work is CI/observability only.

---

## Track 1 — Visual regression on PR (Playwright snapshots)

**Goal:** Block any PR that visually changes a curated set of routes/components without an approved snapshot update.

### Scope
- Add a dedicated Playwright project `visual-regression` (chromium-desktop + mobile-chrome only — webkit/firefox font rendering is too noisy for pixel diffs).
- Snapshot 12 routes × 2 viewports (1280×720, 390×844): `/`, `/login`, `/register`, `/forgot-password`, `/project-openings`, `/project-openings/:sample`, `/dashboard` (logged-out redirect), `/accessibility`, `/privacy`, `/cookies`, `/terms`, `/404`.
- Snapshot 6 critical components in isolation via a `/dev/visual` harness route (gated behind `import.meta.env.DEV || VITE_VISUAL_HARNESS=1`): `Button` variants, `Card`, `Badge`, `Toast`, `ConfirmDialog`, `StepProgressBar`.

### Technical details
- New file `e2e/visual/visual.e2e.ts` using `expect(page).toHaveScreenshot()` with `maxDiffPixelRatio: 0.01`, `animations: "disabled"`, `caret: "hide"`.
- Stabilize: inject `*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }` via `page.addStyleTag` in `beforeEach`. Mock `Date.now()` and `Math.random` via `page.addInitScript`. Wait for `document.fonts.ready` + `[data-rum-ready="true"]` sentinel on `<body>` (added in track 4) so RUM idle has settled.
- Baseline snapshots committed to `e2e/visual/__screenshots__/` (LFS not needed — PNGs small).
- New script `npm run test:visual` + `npm run test:visual:update` (`--update-snapshots`).
- New GitHub Action job `visual-regression` in `cross-browser.yml`: runs on every PR, uploads `playwright-report/` + diff artifacts. PRs with intentional UI changes use the `visual-baseline-update` label → workflow auto-runs `--update-snapshots` and commits via a bot PR comment with the new PNGs attached for review.
- Use `actions/cache` keyed on `package-lock.json` hash for Playwright browser binaries.

### BDD (insert into `bdd_scenarios`)
- **VISREG-001** Snapshot baseline matches on unchanged PR  
  Given baseline PNGs exist for all 12 routes × 2 viewports  
  When the visual job runs on a PR with no UI changes  
  Then [UI] zero diff PNGs are produced  
  And [Code] the `visual-regression` job exits 0  
  And [DB] no `bdd_scenarios.last_run_status` regression is recorded
- **VISREG-002** Unintentional UI drift fails the PR  
  Given a PR changes `Button` padding by 2px  
  When the visual job runs  
  Then [UI] the diff PNG for the harness `Button` snapshot is uploaded  
  And [Code] the job exits non-zero and the GitHub check is red  
  And [DB] no baseline mutation occurs
- **VISREG-003** Approved update via `visual-baseline-update` label  
  Given a maintainer adds the `visual-baseline-update` label  
  When CI re-runs  
  Then [UI] new baseline PNGs are committed and a bot comment links the diffs  
  And [Code] the workflow exits 0 after the update commit  
  And [DB] no schema change
- **VISREG-004** Font/animation jitter does not flake  
  Given the same PR is re-run 5 times back-to-back  
  When the visual job runs each time  
  Then [UI] zero pixel diffs across all 5 runs  
  And [Code] the job is green ≥99% over the last 50 main-branch runs  
  And [DB] no entry appears in `agent_fix_queue` for visual flake

---

## Track 2 — Expanded device matrix (config + beyond config)

**Goal:** Cover the smallest, largest, and most-broken real devices we currently miss.

### Within `playwright.config.ts`
Add these projects to `allProjects` (run only under `PLAYWRIGHT_FULL_MATRIX=1`):
- `mobile-safari-se` — `devices["iPhone SE (3rd gen)"]` (375×667 — smallest modern iOS)
- `mobile-chrome-fold` — `devices["Galaxy Z Fold 5"]` w/ inner viewport 344×882 (narrowest Android)
- `mobile-safari-pro-max` — `devices["iPhone 15 Pro Max"]` (430×932 — largest phone)
- `tablet-landscape` — iPad Pro 11 rotated `viewport: { width: 1194, height: 834 }`
- `desktop-1366` — `devices["Desktop Chrome"]` viewport 1366×768 (still the global modal desktop)
- `desktop-4k` — 3840×2160 with `deviceScaleFactor: 2`
- `firefox-esr` — pinned Firefox ESR channel (`channel: "firefox-beta"` toggled per release window)

### Beyond Playwright config (real-device cloud)
- Add `.github/workflows/browserstack-weekly.yml` (cron `0 9 * * MON`, `workflow_dispatch`).
- Uses `browserstack/github-actions/setup-env` + `browserstack-node-sdk` to run a tiny smoke pack (`e2e/smoke/*.smoke.e2e.ts` — new dir, 6 happy-path flows: load landing, login, view project opening, apply, dashboard load, logout).
- Real-device matrix (free OSS tier compatible): iPhone 12 (iOS 15), iPhone 15 (iOS 17), Samsung Galaxy S22 (Android 13), Pixel 8 (Android 14), Surface Duo, Macbook Safari 17, Windows 11 Edge.
- Secrets: `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY` (add via `secrets--add_secret` at implementation time).
- Failure path: posts a Discord notification via existing `discord-notify` edge fn (admin channel) — never blocks `main`.

### Throttled-network profile
- Add Playwright `use.contextOptions` profile `slow3g` (`downloadThroughput: 50 * 1024`, `latency: 400`) used by 3 critical-path tests (login, project opening view, apply) — catches blocking-resource regressions WebPageTest would catch.

### BDD
- **DEVMAT-001** Smallest iOS viewport (iPhone SE) renders nav without overflow  
  Given the `mobile-safari-se` project runs `e2e/responsive-stability.e2e.ts`  
  When the landing page loads  
  Then [UI] no element has `scrollWidth > clientWidth`  
  And [Code] the project exits 0 in CI  
  And [DB] `bdd_scenarios.coverage` row DEVMAT-001 is updated by the post-run reporter
- **DEVMAT-002** Foldable inner display (344px) keeps primary CTA visible  
  Given `mobile-chrome-fold` viewport  
  When `/project-openings/:id` loads  
  Then [UI] `[data-testid="apply-cta"]` is in the viewport above the fold  
  And [Code] the assertion passes in CI  
  And [DB] no regression recorded
- **DEVMAT-003** 4K desktop does not blow up max-width layouts  
  Given `desktop-4k` viewport  
  When the dashboard loads as an admin  
  Then [UI] the main content `max-width` is honoured (≤ 1440px)  
  And [Code] CI passes  
  And [DB] no regression recorded
- **DEVMAT-004** BrowserStack weekly smoke pack stays green on real devices  
  Given the weekly cron at Monday 09:00 UTC  
  When the 6 smoke flows run across the 7 real-device matrix  
  Then [UI] ≥95% pass rate over rolling 4 weeks  
  And [Code] failures post to the admin Discord channel  
  And [DB] failure fingerprints land in `agent_fix_queue` via existing triage path
- **DEVMAT-005** Slow-3g profile keeps login interactive < 8s  
  Given the `slow3g` context  
  When `/login` loads  
  Then [UI] the email input is focusable within 8s  
  And [Code] the Playwright timeout asserts < 8000ms  
  And [DB] a `web_vital_samples` row is recorded with `connectionType="slow-2g"|"3g"`

---

## Track 3 — Static guardrails (browserslist + compat + stylelint)

**Goal:** Catch unsupported CSS/JS at lint time, before CI even runs Playwright. Fails fast, costs nothing.

### Pieces
1. **`eslint-plugin-compat`** — fails on JS APIs not in browserslist.
   - Add to `devDependencies`, register in `eslint.config.js` as `compat/compat: "error"`.
   - Reads existing `browserslist` from `package.json` (already correct).
2. **`stylelint` + `stylelint-no-unsupported-browser-features`** — fails on CSS not in browserslist.
   - New `.stylelintrc.json` extending `stylelint-config-standard` + the unsupported-browser-features rule with `severity: "error"`, `ignore: ["css-nesting", "css-when-else"]` (we transpile via Tailwind).
   - Add `npm run lint:css` → `stylelint "src/**/*.css" "src/**/*.tsx"`.
3. **`@unocss/eslint-plugin` substitute — custom rule** to forbid raw `100vh` / `h-screen` (already a Core memory rule but unenforced in lint). Implement as `scripts/lint/eslint-plugin-css-portability.mjs` with `no-vh-units` + `no-h-screen` rules. Co-locates with existing `eslint-plugin-brand-terms.mjs`.
4. **Tailwind config audit** — extend `tailwind.config.ts` with `safelist` for our dynamic class names + add `corePlugins.preflight: true` (already on). No behavioural change.
5. **CI**: extend `regression.yml` to run `npm run lint && npm run lint:css` as a single gating step before unit tests.

### BDD
- **GUARD-001** ESLint-compat blocks unsupported JS API  
  Given a PR adds `structuredClone(deep)` without a polyfill  
  When `npm run lint` runs in CI  
  Then [UI] N/A (lint output only)  
  And [Code] eslint exits non-zero with `compat/compat` error citing iOS 14.5  
  And [DB] no schema change
- **GUARD-002** Stylelint blocks unsupported CSS  
  Given a PR adds `aspect-ratio: 1` without a `@supports` fallback in `src/index.css`  
  When `npm run lint:css` runs  
  Then [UI] N/A  
  And [Code] stylelint exits non-zero  
  And [DB] no change
- **GUARD-003** Custom rule blocks `h-screen` / `100vh`  
  Given a PR adds `<div className="h-screen">`  
  When eslint runs  
  Then [UI] N/A  
  And [Code] `css-portability/no-h-screen` errors with the dvh-fallback fix hint  
  And [DB] no change
- **GUARD-004** Lint guardrails block merge in `regression.yml`  
  Given a PR opens with any of GUARD-001..003 violations  
  When the `regression` workflow runs  
  Then [UI] the PR check shows red  
  And [Code] the workflow exits before reaching unit tests  
  And [DB] no `agent_fix_queue` row (these are pre-runtime errors)

---

## Track 4 — RUM browser breakdown (extend existing beacon)

**Goal:** Slice existing web-vitals data by browser/device so we can see "p75 LCP on Firefox mobile is 4.3s" not just the global p75.

### Client (`src/lib/web-vitals.ts`)
- Add to payload: `browserName`, `browserMajor`, `osName`, `osMajor`, `deviceType` (`desktop|mobile|tablet|bot`).
- Detect via lightweight UA-CH first (`navigator.userAgentData.getHighEntropyValues(["platform","platformVersion","model","architecture"])`) with a UA-string regex fallback (no `ua-parser-js` — adds 30KB; we hand-roll a 40-line parser).
- Add `<body data-rum-ready>` sentinel toggled after first beacon flush, used by Track 1's visual tests.

### Edge function (`supabase/functions/record-web-vital/index.ts`)
- Extend Zod schema with new fields (each capped: `browserName` ≤ 32, `osName` ≤ 32, `deviceType` enum-validated).
- Continue to swallow on overflow → 204.

### Database
- Migration adds columns `browser_name text`, `browser_major int`, `os_name text`, `os_major int`, `device_type text check (device_type in ('desktop','mobile','tablet','bot'))` to `web_vital_samples`.
- Backfill: `update web_vital_samples set device_type='unknown' where device_type is null;` (default value, not retroactive parsing).
- Index: `create index web_vital_samples_browser_idx on web_vital_samples(metric_name, browser_name, created_at desc);`.

### RPCs
- New `web_vitals_p75_by_browser(p_window_hours int)` — returns `(browser_name, device_type, metric_name, sample_count, p75, p95, good_pct)` with `sample_count >= 10` privacy floor.
- New `web_vitals_p75_by_route_browser(p_window_hours int, p_route text)` — drill-down.
- Security definer, granted to `authenticated`; admin-only via existing SELECT policy.

### UI (`PerformanceTab.tsx`)
- New sub-tab "By browser" showing a heatmap-style table: rows = browser × OS × deviceType, cols = LCP/INP/CLS/FCP/TTFB p75 with Good/NI/Poor color chips.
- Existing "By route" tab gets a "Filter by browser" Select that pipes into the new RPC.
- All Card/Table from existing design system, no new tokens.

### BDD
- **RUMBR-001** Beacon emits browser/OS fields on Chrome desktop  
  Given a Chrome user loads `/`  
  When LCP is reported  
  Then [UI] N/A (background beacon)  
  And [Code] the `record-web-vital` edge fn receives a payload with `browserName="Chrome"`, `deviceType="desktop"`  
  And [DB] a row in `web_vital_samples` has matching `browser_name`/`device_type`
- **RUMBR-002** UA-CH absent → UA-string fallback parses Safari iOS  
  Given a request with no `Sec-CH-UA` and `User-Agent: iPhone … Safari`  
  When the beacon is sent  
  Then [UI] N/A  
  And [Code] payload contains `browserName="Safari"`, `osName="iOS"`, `deviceType="mobile"`  
  And [DB] row stored with same values
- **RUMBR-003** Performance tab renders By-browser breakdown for admins  
  Given an admin opens System Health → Performance → By browser  
  When the table loads  
  Then [UI] rows appear only for browsers with ≥10 samples in the window  
  And [Code] the `web_vitals_p75_by_browser` RPC returns rows  
  And [DB] RLS blocks the same RPC for non-admin auth users
- **RUMBR-004** Privacy floor hides low-sample browsers  
  Given a browser has 7 samples in 24h  
  When the RPC runs  
  Then [UI] that browser does not appear in the table  
  And [Code] the RPC filters `having sample_count >= 10`  
  And [DB] underlying rows are not deleted
- **RUMBR-005** Save-Data clients still skip the beacon (regression guard)  
  Given a user with `navigator.connection.saveData === true`  
  When pages load  
  Then [UI] no console errors  
  And [Code] zero fetches to `/functions/v1/record-web-vital`  
  And [DB] zero rows inserted from that session

---

## Rollout order & CI cost
1. **Track 3** (static guardrails) — 1 day, zero CI minutes added.
2. **Track 4** (RUM browser breakdown) — 1 day client + 1 migration + 1 day UI; no CI impact.
3. **Track 1** (visual regression) — 2 days; adds ~5 min/PR (chromium + mobile-chrome only).
4. **Track 2** (device matrix expansion) — 1 day config + 1 day BrowserStack wiring; weekly cron only.

## Out of scope
- Cross-browser ad-blocker simulation (separate effort)
- Lighthouse-CI per-browser (already covered by `lighthouse.yml`)
- Visual regression on Firefox/WebKit (too noisy — covered by functional E2E instead)
- Replacing existing `e2e/brand/visual.e2e.ts` token suite (kept; complements pixel diffs)

## Files touched (summary)
- New: `e2e/visual/visual.e2e.ts`, `e2e/visual/__screenshots__/*`, `e2e/smoke/*.smoke.e2e.ts`, `.github/workflows/browserstack-weekly.yml`, `.stylelintrc.json`, `scripts/lint/eslint-plugin-css-portability.mjs`, `supabase/migrations/<ts>_rum_browser_breakdown.sql`, `src/components/system-health/PerformanceByBrowserTab.tsx`, `src/lib/ua-parse.ts`
- Edited: `playwright.config.ts`, `package.json` (scripts + devDeps), `eslint.config.js`, `.github/workflows/cross-browser.yml`, `.github/workflows/regression.yml`, `src/lib/web-vitals.ts`, `src/components/system-health/PerformanceTab.tsx`, `supabase/functions/record-web-vital/index.ts`
- BDD inserts: 18 scenarios across `VISREG-001..004`, `DEVMAT-001..005`, `GUARD-001..004`, `RUMBR-001..005`
