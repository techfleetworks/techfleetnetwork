

# Updated BDD Scenarios: Step Completion Model

## Problem
Path steps need a consistent completion model. Some steps are simple self-report actions ("Obtain Observer role in Discord"), but others are entire multi-lesson courses ("Finish the Observer Handbook course" = 7 lessons). We need to handle both without overwhelming users.

## Design Decisions

**Completion model:** Every step requires the user to explicitly confirm "I am complete" — matching the existing course lesson pattern (the "Mark as Complete" button at the bottom of the lesson dialog).

**Course-type steps — the key UX challenge:** When a step IS a course (e.g., "Finish the Observer Handbook"), the step card in the path detail view should:
1. Show an inline progress indicator (e.g., "5/7 lessons") so users see progress without leaving the path view
2. Provide a "Go to Course" link that navigates to the course page
3. Auto-complete the step when all lessons in the linked course are done (no need to manually confirm — the course completion IS the confirmation)
4. Show "Auto-verified from course progress" text so users understand why it completed
5. NOT require double-confirmation (completing all lessons + separately marking the step done)

**Simple steps:** Show the same "Mark as Complete" button pattern used in courses, but within the path detail view instead of a lesson dialog.

## Step Type Classification

| Type | Example | Completion Method |
|------|---------|-------------------|
| **Course** | "Finish the Observer Handbook" | Auto-completes when all course lessons are done |
| **Self-report** | "Post reflection in Discord" | User clicks "I have completed this step" |
| **System-verified** | "Get your certification" | Auto-completes from `class_certifications` table |
| **Application** | "Complete the General Application" | Auto-completes from `general_applications` table |

## Changes to the v3 Document

### New scenarios to add (~8):

- **QP-STEP-001**: Self-report step shows "I have completed this step" button in path detail
- **QP-STEP-002**: Confirming self-report shows confirmation dialog ("Are you sure?") before marking done
- **QP-STEP-003**: Completed self-report step can be toggled back to incomplete (matches course pattern)
- **QP-STEP-004**: Course-type step shows inline progress bar with lesson count
- **QP-STEP-005**: Course-type step shows "Go to Course" link that navigates to the course page
- **QP-STEP-006**: Course-type step auto-completes when all linked lessons are marked done
- **QP-STEP-007**: Course-type step cannot be manually unchecked (must uncomplete lessons in the course)
- **QP-STEP-008**: System-verified step shows data source and sync date, cannot be manually toggled

### Updated mockup for path detail (showing mixed step types):

```text
STEPS
+---------------------------------------------------------------+
|  [x]  1. Finish the "Observer Handbook" course     [COURSE]   |
|       7/7 lessons complete                                    |
|       Auto-verified from course progress                      |
+---------------------------------------------------------------+
|  [x]  2. Finish the "Discord Learning Series"     [COURSE]   |
|       20/20 lessons complete                                  |
|       Auto-verified from course progress                      |
+---------------------------------------------------------------+
|  [ ]  3. Sponsor a project to follow               <- YOU    |
|       Choose a project from the project list                  |
|       [I have completed this step]                            |
+---------------------------------------------------------------+
|  ( )  4. Obtain Observer role in Discord                      |
|       Available after step 3                                  |
+---------------------------------------------------------------+

--- Course-type step (in progress, not yet auto-completed): ---
+---------------------------------------------------------------+
|  [ ]  1. Finish "Build an Agile Mindset"           [COURSE]  |
|       ============............  12/20 lessons                 |
|       [Go to Course ->]                                       |
+---------------------------------------------------------------+
```

### What gets updated in the document
1. Add a "Step Completion Model" section explaining the 4 step types
2. Add 8 new QP-STEP scenarios (total becomes ~61)
3. Update all path detail mockups to show step type badges and appropriate completion UIs
4. Update QP-PROG-005 (self-reported step) to use "I have completed this step" language
5. Update QP-PROG-006 (auto-completed) to reference course-type step behavior
6. Annotate each path's steps table with the step type

## Technical Notes
- `quest_path_steps` table needs a `step_type` enum: `course`, `self_report`, `system_verified`, `application`
- Course-type steps need a `linked_phase` column referencing the course's journey phase
- A database trigger or edge function watches `journey_progress` completions and auto-marks course-type path steps as done
- Self-report steps use the same `journey_progress` upsert pattern as existing lessons

## Deliverable
Updated `/mnt/documents/quest-journey-bdd-scenarios-v3.md` with all changes above.

