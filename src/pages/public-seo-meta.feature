# Public-access C14a: SEO metadata for the public routes.
#
# Audiences:
#   - search-crawler : a search engine / social crawler reading each public route's
#     <head> (title, description, canonical, Open Graph, schema.org JSON-LD)
#   - anonymous : a logged-out visitor whose page sets that head at runtime
#
# C14a is the single meta SOURCE (src/lib/seo/public-route-meta.ts) consumed by the
# runtime <SEO> component and, next (C14b), the build-time prerender. @status:proven
# scenarios are backed by src/test/lib/public-route-meta.test.ts and
# src/test/ui/SEO.test.tsx.

Feature: Public route SEO metadata (C14a)

  Each public route has one authored source of its SEO metadata — title,
  description, canonical URL, Open Graph, and schema.org JSON-LD — so the runtime
  head and the C14b prerendered head are built from the same place and cannot
  drift. The JSON-LD is escaped so a value can never break out of the script tag.

  @audience:search-crawler @usecase:seo-static-meta @category:happy @quality:functional @severity:medium @status:proven
  Scenario: Each static public route resolves complete, well-formed meta
    Given the public-route-meta builders for /, /courses, and /project-openings
    When a route's meta is requested
    Then it returns a non-empty title, a description, the correct canonical path, and JSON-LD

  @audience:search-crawler @usecase:seo-jsonld-graph @category:happy @quality:functional @severity:medium @status:proven
  Scenario: A route's JSON-LD wraps into a valid schema.org document
    Given a static route's JSON-LD nodes
    When they are wrapped for the <script> body
    Then the result is a valid @context/@graph document that serializes as JSON

  @audience:search-crawler @usecase:seo-jsonld-escape @category:adverse @quality:security @severity:high @status:proven
  Scenario: A JSON-LD value cannot break out of the inline script tag
    Given a JSON-LD value containing the text "</script><script>"
    When it is serialized for the inline JSON-LD script
    Then every "<" is escaped so the script tag cannot be closed early
    And the serialized body is still valid JSON that round-trips to the original value

  @audience:anonymous @usecase:seo-runtime-head @category:happy @quality:functional @severity:medium @status:proven
  Scenario: The SEO component emits JSON-LD and OG image tags into the head
    Given a public page rendering <SEO> with a route's meta and an ogImage
    When the page mounts
    Then a schema.org JSON-LD script and the OG/Twitter image tags are present in the document head

  @audience:anonymous @usecase:seo-no-image-scope @category:boundary @quality:functional @severity:low @status:proven
  Scenario: A page without an ogImage emits no image or card tags
    Given a page rendering <SEO> with no ogImage
    When the page mounts
    Then no og:image or twitter:card tag is added, so pages that pass no image are unchanged
