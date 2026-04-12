

# Updated BDD Scenarios Document with Timeframe Data

## What Changed
The updated CSV adds **Estimated Timeframe to Complete** with phase breakdowns for all 8 paths (plus Measure Practices kept from previous version = 9 total). It also clarifies the "Learn and Practice Skills" and "Client-Facing Project Teamwork" paths with full step definitions.

## Plan

### 1. Generate updated document at `/mnt/documents/quest-journey-bdd-scenarios-v3.md`

**Updates to existing scenarios:**
- Add timeframe data to the path seed/reference table (all 9 paths with `estimated_duration` summary and `duration_breakdown` phases)
- Update path card mockups to show timeframe inside the detail view (not on card badge per your preference)
- Update "Learn and Practice Skills" path steps to match the new CSV (Research → Register → Submit homework → Get certification)
- Update "Client-Facing Project Teamwork" path with 16-week breakdown and its 3 prerequisites
- Add "Measure Your Team Practices" back as a path (kept from previous version)

**New BDD scenarios to add:**

| ID | Scenario | Section |
|----|----------|---------|
| QP-TIME-001 | Path detail view shows estimated timeframe summary | Timeframe Display |
| QP-TIME-002 | Path detail view shows phase breakdown (e.g., "1 week to start, 2 weeks to observe") | Timeframe Display |
| QP-TIME-003 | Timeframe adjusts language for variable durations ("5 to 8 weeks") | Timeframe Display |
| QP-TIME-004 | Intake wizard shows timeframe alongside recommended paths | Intake |
| QP-TIME-005 | Total estimated time shown for full recommended plan | Intake |
| QP-LEARN-001 | Learn and Practice Skills path shows masterclass research step | Path Steps |
| QP-LEARN-002 | Certification step auto-completes from class_certifications table | Path Steps |
| QP-CLIENT-001 | Client-Facing Project Teamwork path requires 3 prerequisites completed | Prerequisites |
| QP-CLIENT-002 | Client path shows 16-week timeline with 4 phases | Timeframe |
| QP-VOL-001 | Volunteer Team path requires 3 prerequisites | Prerequisites |
| QP-VOL-002 | Volunteer path shows 13-week timeline | Timeframe |

**Updated path reference table (9 paths):**

```
Path                          | Timeframe    | Breakdown                              | Level
------------------------------|-------------|----------------------------------------|----------
Onboard to the Community      | 1 day       | 1 day to onboard                       | Beginner
Plan Your Training Journey    | 2 weeks     | 2 weeks for growth roadmap             | Beginner
Observe Teams                 | 4 weeks     | 1w start + 2w observe + 1w reflect     | Beginner
Learn and Practice Skills     | 5-8 weeks   | 1w start + 4-8w class                  | Beginner
Become a Service Leader       | 3 weeks     | 1w start + 2w class                    | Beginner
Measure Your Team Practices   | 2 weeks     | (from previous version)                | Beginner
Build an Agile Mindset        | 5 weeks     | 1w start + 4w practice                 | Beginner
Client-Facing Project Work    | 16 weeks    | 1w start + 4w wait + 3w onboard + 9w  | Advanced
Join a Volunteer Team         | 13 weeks    | 1w start + 12w complete                | Advanced
```

**Updated ASCII mockup** for path detail view showing timeframe:

```
+--------------------------------------------------+
| <- Back to My Journey                            |
|                                                  |
| [icon] Observe Teams                             |
| Beginner Path                                    |
|                                                  |
| Estimated Time: ~4 weeks                         |
| +----------------------------------------------+ |
| | 1 week to start | 2 weeks to observe |       | |
| | 1 week to reflect                    |       | |
| +----------------------------------------------+ |
|                                                  |
| Progress: 3/7 steps (43%)                        |
| [====================............] 43%           |
|                                                  |
| Steps:                                           |
| [x] Finish the Observer Handbook course          |
| [x] Finish the Discord Learning Series           |
| [ ] Sponsor a project to follow      <- Current |
| [ ] Obtain Observer role in Discord              |
| [ ] Join Observer meetings (2x/week, 2 weeks)   |
| [ ] Post reflection in Discord                  |
| [ ] Answer general application question          |
+--------------------------------------------------+
```

### 2. Deliverable
A single Markdown file with all ~52+ BDD scenarios (41 existing + 11 new timeframe/path scenarios), updated mockups, and the complete 9-path reference table with timeframe data.

### Technical Details
- Output: `/mnt/documents/quest-journey-bdd-scenarios-v3.md`
- No code changes — requirements document only
- Timeframe stored as two fields in the future `quest_paths` table: `estimated_duration` (text, e.g., "4 weeks") and `duration_phases` (jsonb array, e.g., `[{"label": "Start", "duration": "1 week"}, ...]`)

