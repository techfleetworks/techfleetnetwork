# 20261124 — Public SEO metadata is owned by one module, consumed by runtime and prerender (C14a)

- Status: Accepted
- Date: 2026-11-24
- Deciders: product owner (mdenner), engineering
- Ticket: public-access, Phase C / C14 (§4.2/4.3, AC2)
- Related: 20261116-public-visibility-auth-aware (A5), BUILD-PLAN Phase C.

## Context and problem statement

The app is a static SPA on Cloudflare Pages (`not_found_handling:
single-page-application`), **no SSR**. SEO is injected client-side by
`react-helmet-async` (the `SEO` component), so a crawler that does not execute JS
sees the index shell's generic `<head>`, not each public route's real title,
description, or structured data. Phase C / C14 must make the public routes
crawlable and shareable: real meta, Open Graph, and schema.org JSON-LD in the
initial HTML.

The owner set Phase C's shape this session:
- **C14 prerender covers dynamic detail pages too** (classes, projects, courses by
  slug), not only the static routes.
- **C15 "launch" has no flag.** Public access is already live in prod — the route
  branches (`CoursesRoute`, `ProjectOpeningsRoute`, `Index`) render the public page
  for an anon visitor with no feature-flag gate, and no `public-access` flag exists
  in `src/`. So each B-phase PR shipped public access as it merged. C15 is therefore
  SRE readiness (SLOs/alerts, cache-purge-on-unpublish, runbooks) + confirming the
  exposure canary + declaring launched — **not** a flag flip (the plan's "behind a
  flag until C15" premise was never implemented in the route layer).

## Decision (C14a — the foundation PR)

- **One owner of each public route's SEO metadata:** `src/lib/seo/public-route-meta.ts`.
  Pure functions, **no react / DOM / fetch**, returning a `PageMeta` (title,
  description, canonicalPath, ogType, ogImage?, jsonLd?). It also owns `formatTitle`
  (the brand suffix), `absoluteUrl` (canonical), `withContext` (schema.org
  `@context`/`@graph` wrapper), and `jsonLdToString` (serializer).
- **Both consumers build identical head tags from that one source,** so they cannot
  drift:
  - runtime — the `SEO` component now imports `formatTitle`/`absoluteUrl`/
    `jsonLdToString` from the module and renders JSON-LD + OG/Twitter image tags;
  - build time — the C14b prerender script (Node, no browser) will import the **same**
    builders to write the real `<head>` into `dist/<route>/index.html`.
- **Framework-free on purpose.** Keeping the module react-free is what lets the Node
  prerender import it unchanged — the key enabler for C14b without SSR or a headless
  browser (template injection, not puppeteer).
- **JSON-LD is escaped once, centrally.** `jsonLdToString` escapes `<` to `<`
  so a value containing `</script>` cannot break out of the inline tag — the one
  injection vector for inline JSON-LD, closed in the single serializer both consumers
  use.
- **Scope of C14a:** the three static public routes (`/`, `/courses`,
  `/project-openings`) wired to the builders, with Organization / WebSite /
  CollectionPage JSON-LD. The dynamic-entity builders (class / course / project
  detail) land in **C14b** alongside the prerender that consumes them, so this PR
  stays pure and infra-free.

## Pattern-decision record (pattern-selector)

- **Problem / forces:** give crawlers real per-route head on a no-SSR static SPA;
  do not let runtime and build-time meta drift; no headless browser in CI / the
  Cloudflare build if avoidable.
- **Pattern chosen:** a single Humble-source meta module (pure data → `PageMeta`)
  consumed by a Humble view (the `SEO` component) and, next, a Humble build step
  (the prerender script). No SSR, no Strategy, no puppeteer.
- **Candidates considered:**
  - (a) Shared pure meta module + template-injection prerender — chosen. Deterministic,
    testable in Node, no browser; the module is the drift-proof single source.
  - (b) Puppeteer/react-snap crawl of the built app — rejected for now: a headless
    chromium in the Cloudflare Pages build and CI is heavy and flaky; the meta is
    derivable from data without rendering.
  - (c) `vite-react-ssg` / SSR framework — rejected: restructures react-router and the
    boot sequence (which carries auth band-aids) for head tags alone.
- **Failure / rot prevented:** runtime and prerendered meta disagreeing; a `</script>`
  breakout in JSON-LD; a second place authoring page titles.
- **Verify correct application:** vitest — each static builder returns complete,
  well-formed meta; JSON-LD wraps into a valid `@context`/`@graph` document and
  round-trips through the serializer; `formatTitle` is idempotent; `jsonLdToString`
  escapes every `<` (discriminating test); the `SEO` component emits the JSON-LD
  script + OG image into the head.
- **Real guarantee:** the static public routes carry correct, escaped, single-sourced
  meta + JSON-LD at runtime, and the module is ready for C14b to reuse verbatim. It
  does **not** yet put that head into the static HTML for non-JS crawlers — that is
  C14b (prerender).

## Consequences

- New: `src/lib/seo/public-route-meta.ts`; tests `public-route-meta.test.ts`,
  `SEO.test.tsx`; `public-seo-meta.feature`.
- Changed: `SEO.tsx` (sources title/canonical from the module; adds `jsonLd` +
  `ogImage`); `LandingPage.tsx`, `PublicCoursesPage.tsx`,
  `PublicProjectOpeningsPage.tsx` (inline SEO strings → builder spread).
- Next (C14b): dynamic-entity builders + the prerender script writing
  `dist/<route>/index.html` (static + dynamic) + sitemap extension to classes/courses.
  (C14c): the `public-feed?v=1` aggregated gateway (AC2). Then **C15** readiness +
  declare launched (no flag).

## Post-review (judge-arch fresh context, 2026-11-25)

Two data-ownership duplications caught and fixed so the "single owner" claim is
actually true:
- **F1 (title suffix):** the brand suffix existed already in `RouteTitle.tsx`
  (sets `document.title` synchronously for GA4 before `<SEO>` hydrates). Removed
  the duplicate literal; `RouteTitle` now calls `formatTitle` from this module, so
  the synchronous title and the helmet title share one suffix owner.
- **F2 (production origin):** `BASE_URL` was a second copy of
  `canonical-origin.ts`'s `PRIMARY_PRODUCTION_ORIGIN`. Exported that const and
  consume it here — the SEO canonical IS the canonical production origin. The
  import is window-free at load, so the module stays prerender-safe.
