# Public-access B12: the free Core-course detail page at /course/:courseKey.
#
# Audiences:
#   - anonymous : a logged-out visitor (sees the public outline)
#   - authenticated: a signed-in member (redirected to their in-platform course page)
#
# @status:proven scenarios are backed by src/test/ui/PublicCourseDetailPage.test.tsx,
# src/test/data/public-course-registry.test.ts, src/test/lib/format-duration.test.ts,
# and supabase/functions/youtube-durations/lib.test.ts (Deno).

Feature: Public free-course detail page (B12)

  A logged-out visitor can open a free Core course at /course/:courseKey and see what
  it covers — modules, each lesson's title, whether it is a video or a reading, and
  the video length — before joining. A signed-in member is sent to their in-platform
  course page. Which courses are public is owned by the public-courses gateway.

  @audience:anonymous @usecase:course-detail-outline @category:happy @quality:functional @severity:high @status:proven
  Scenario: The course page shows the module/lesson outline with video and reading indicators
    Given a logged-out visitor on /course/:courseKey for a public Core course
    When the page renders
    Then the course title and its modules are shown
    And each lesson shows its title and whether it is a Video or a Reading
    And a Join Platform action is offered

  @audience:anonymous @usecase:course-detail-video-length @category:happy @quality:functional @severity:medium @status:proven
  Scenario: A video lesson shows its length when available
    Given a public Core course with a video lesson
    And the youtube-durations gateway returns that video's length
    When the page renders
    Then the lesson shows the formatted length (for example 8:30)

  @audience:anonymous @usecase:course-detail-length-graceful @category:adverse @quality:reliability @severity:medium @status:proven
  Scenario: A missing video length never breaks the page
    Given the youtube-durations gateway returns no length (unset key or YouTube error)
    When the page renders
    Then the lesson still shows the Video indicator with no length
    And the page does not error

  @audience:anonymous @usecase:course-detail-not-found @category:negative @quality:functional @severity:medium @status:proven
  Scenario: An unknown or non-public course shows a not-found page
    Given a course key that is not in the public catalog feed
    When the page renders
    Then a not-found message and a link back to Courses are shown

  @audience:anonymous @usecase:youtube-key-secret @category:permission @quality:security @severity:high @status:proven
  Scenario: The YouTube API key is never exposed to the browser
    Given the page needs video lengths
    When it requests them
    Then it calls the youtube-durations gateway, which holds the key server-side
    And the gateway only accepts well-formed, capped video ids (no injection)
