# Public-access B12: the free Core-course detail page at /course/:courseKey.
#
# Audiences:
#   - anonymous : a logged-out visitor (sees the public outline)
#   - authenticated: a signed-in member (redirected to their in-platform course page)
#
# @status:proven scenarios are backed by src/test/ui/PublicCourseDetailPage.test.tsx
# and src/test/data/public-course-registry.test.ts.

Feature: Public free-course detail page (B12)

  A logged-out visitor can open a free Core course at /course/:courseKey and see what
  it covers — modules, each lesson's title, whether it is a video or a reading, and a
  one-sentence plain-English takeaway of the lesson's key point — before joining. A
  signed-in member is sent to their in-platform course page. Which courses are public
  is owned by the public-courses gateway.

  @audience:anonymous @usecase:course-detail-outline @category:happy @quality:functional @severity:high @status:proven
  Scenario: The course page shows the module/lesson outline with video and reading indicators
    Given a logged-out visitor on /course/:courseKey for a public Core course
    When the page renders
    Then the course title and its modules are shown
    And each lesson shows its title and whether it is a Video or a Reading
    And a Join Platform action is offered

  @audience:anonymous @usecase:course-detail-takeaway @category:happy @quality:functional @severity:medium @status:proven
  Scenario: Each lesson shows a one-sentence takeaway of its key point
    Given a public Core course whose lessons have authored takeaways
    When the page renders
    Then each lesson shows its plain-English takeaway sentence
    And no video length (minutes) is shown anywhere

  @audience:anonymous @usecase:course-detail-takeaway-coverage @category:boundary @quality:functional @severity:medium @status:proven
  Scenario: Every Core lesson has an authored takeaway
    Given the public course content registry
    When its lessons are listed for every Core course
    Then every lesson maps to a non-empty one-sentence takeaway
    And a lesson with no authored takeaway resolves to null, never a crash

  @audience:anonymous @usecase:course-detail-not-found @category:negative @quality:functional @severity:medium @status:proven
  Scenario: An unknown or non-public course shows a not-found page
    Given a course key that is not in the public catalog feed
    When the page renders
    Then a not-found message and a link back to Courses are shown
