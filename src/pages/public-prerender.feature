# Public-access C14b: build-time prerender of the public routes.
#
# Audiences:
#   - search-crawler : a non-JS crawler/social bot that reads the STATIC HTML a
#     public route serves (dist/<route>/index.html), not the hydrated DOM
#   - anonymous : a logged-out visitor whose SPA still boots over that head
#
# The prerender injects each route's head from the same src/lib/seo builders the
# runtime uses. @status:proven scenarios are backed by
# src/test/lib/prerender-html.test.ts and src/test/lib/public-route-meta.test.ts.

Feature: Prerendered public route head (C14b)

  Each public route is written to dist/<route>/index.html with a real <head>
  (title, description, canonical, Open Graph, JSON-LD) built from the one meta
  source, so a non-JS crawler reads the right head while the SPA still boots over
  it. The tags the shell already ships are replaced in place, never duplicated.

  @audience:search-crawler @usecase:prerender-head @category:happy @quality:functional @severity:high @status:proven
  Scenario: A route's prerendered HTML carries its own head
    Given the built index.html as a template and a public route's meta
    When the route is prerendered
    Then its title, description, canonical, Open Graph, and JSON-LD are the route's
    And the body's #root mount and entry script are unchanged so the SPA still boots

  @audience:search-crawler @usecase:prerender-no-dup @category:adverse @quality:functional @severity:high @status:proven
  Scenario: Existing Open Graph tags are replaced, not duplicated
    Given a template that already ships og:title, og:description, og:type, twitter:title
    When a route is prerendered over it
    Then each of those tags appears exactly once, carrying the route's value

  @audience:search-crawler @usecase:prerender-dynamic @category:happy @quality:functional @severity:medium @status:proven
  Scenario: Dynamic detail routes get entity-specific meta
    Given a class, course, or project opening from the public gateways
    When its detail route is prerendered
    Then the head carries that entity's title, description, canonical, and JSON-LD

  @audience:anonymous @usecase:prerender-degrade @category:error @quality:reliability @severity:medium @status:planned
  Scenario: A gateway outage prerenders the static routes only, never failing the build
    Given a public gateway is unreachable at build time
    When the prerender runs
    Then the static routes are still written and the build succeeds
    And the dynamic routes fall back to client-side rendering
