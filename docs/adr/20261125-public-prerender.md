# 20261125 — Build-time prerender of the public routes (C14b)

- Status: Accepted
- Date: 2026-11-25
- Deciders: product owner (mdenner), engineering
- Ticket: public-access, Phase C / C14 (§4.2/4.3)
- Related: 20261124-public-seo-meta-foundation (C14a). BUILD-PLAN Phase C.

## Context and problem statement

C14a gave each public route one framework-free source of its SEO metadata, but the
head still only exists at runtime via react-helmet — a non-JS crawler sees the
`index.html` shell. C14b makes the public routes **crawlable**: the real head
(title, description, canonical, Open Graph, JSON-LD) must be in the HTML a crawler
receives, without SSR and without a headless browser. The owner chose to cover the
**dynamic detail pages** (classes, courses, project openings) too, not only the
static routes.

## Decision

- **Post-build head injection, no SSR, no puppeteer.** A `tsx` script
  (`scripts/prerender-public.ts`) runs after `vite build`. It reads the built
  `dist/index.html` once as a template and, per public route, writes
  `dist/<route>/index.html` with that route's head injected. The body (the `#root`
  mount + entry `<script>`) is untouched, so the SPA still boots and hydrates over
  the prerendered head — a JS client is unchanged, a crawler now reads the right
  head. Cloudflare serves `dist/<route>/index.html` for that route and falls back
  to the SPA shell for everything else (`wrangler` `single-page-application`), so
  **no hosting-config change** is needed.
- **One meta source, build and runtime.** The script builds each route's head from
  the **same** `src/lib/seo/public-route-meta` builders the runtime `<SEO>` uses
  (`tsx` resolves the `@/` alias, so the Node build imports them unchanged — the
  enabler C14a was designed for). C14b adds the dynamic builders (`classDetailMeta`,
  `courseDetailMeta`, `projectOpeningMeta`) and wires the two public detail pages to
  them, so the detail routes are single-sourced too (closes the C14a review's
  tracked drift).
- **Injection replaces in place, never duplicates.** `injectRouteHead`
  (`src/lib/seo/prerender-html.ts`) is a pure string transform: it replaces the
  tags `index.html` already ships (`<title>`, description, `og:*`, `twitter:*`,
  the first JSON-LD block) and injects only the ones it lacks (canonical, `og:url`)
  before `</head>`. A discriminating test proves no duplicate OG tags result.
- **Dynamic routes come from the public gateways.** The script fetches
  `public-classes`, `public-courses`, and `public-project-openings` with the anon
  key — the same anon surface a visitor gets (anon has no table grants, A6). A
  gateway failure **degrades** to "prerender what we can" and never fails the build
  (the SPA still renders those routes client-side).

## Pattern-decision record (pattern-selector)

- **Problem / forces:** real per-route head on a no-SSR static SPA, covering dynamic
  detail pages, with no headless browser and no hosting change; never duplicate the
  tags the shell already ships; a data-source outage must not break deploys.
- **Pattern chosen:** a pure Humble head-injection transform fed by the C14a meta
  builders, orchestrated by a resilient post-build script. No SSR framework, no
  puppeteer, no Strategy.
- **Candidates considered:**
  - (a) Post-build template injection reusing the builders — chosen. Deterministic,
    Node-testable, no browser, no route-table restructure.
  - (b) `react-snap`/puppeteer crawl — rejected: a headless chromium in the
    Cloudflare build + CI is heavy and flaky; the head is derivable from data.
  - (c) `vite-react-ssg` / SSR — rejected: restructures react-router and the
    auth-band-aid boot for head tags alone.
- **Failure / rot prevented:** an empty head for crawlers; **duplicate** OG tags
  (the shell already has them); a build that fails when a gateway is briefly down.
- **Verify correct application:** vitest — `injectRouteHead` replaces title/desc,
  injects canonical/OG, replaces the existing OG tags **in place** (discriminating
  no-duplicate test), keeps the `#root`/entry body; the dynamic builders produce the
  right description/JSON-LD; `distPathForRoute` maps routes to files. End-to-end: the
  script run over the real build output yields exactly one `og:title`/canonical per
  route with the correct per-route title.
- **Real guarantee:** every enumerated public route ships a static head a non-JS
  crawler can read, built from the one meta source. It does **not** prerender the
  page BODY (content) — only the head; and dynamic routes are only as complete as the
  gateway feed at build time (an outage prerenders the static routes only).

## Consequences

- New: `scripts/prerender-public.ts`; `src/lib/seo/prerender-html.ts`
  (`injectRouteHead`, `distPathForRoute`); dynamic builders in
  `public-route-meta.ts`; tests `prerender-html.test.ts` + dynamic-builder cases.
- Changed: `package.json` `build` runs the prerender last; `PublicCourseDetailPage`
  / `PublicClassDetailPage` SEO now comes from the builders (single source +
  runtime JSON-LD).
- `dist/<route>/index.html` are build artifacts (dist is gitignored); nothing is
  committed from `dist/`.
- **Deferred (small follow-up):** extend `generate-sitemap.ts` with the dynamic
  class/course routes — it currently fetches project openings via direct REST, which
  anon can no longer read post-A6, so that wants a migration onto the gateways. The
  `public-feed?v=1` aggregated gateway (AC2) is C14c. Then **C15** readiness + declare
  launched.
