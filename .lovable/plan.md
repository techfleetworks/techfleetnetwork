## Issue
The Blast tab on the roster project detail page shows two "Blast history" sections:
1. An inline one inside `ProjectBlastComposer` (lines ~178-190) titled "Blast history / Most recent project blasts you sent for this project. / No blasts sent yet."
2. The standalone `<ProjectBlastHistory />` component rendered below the composer in `RosterProjectDetailPage` titled "Blast history / No blasts have been sent for this project yet."

`ProjectBlastHistory` is the richer, canonical version (real query against `project_blasts`, status badges, recipient/sent/failed counts, formatted timestamps). The composer's inline block is a leftover stub.

## Fix
Remove the inline history `<Card>` block from `src/components/recruiting/ProjectBlastComposer.tsx` (and any now-unused imports/state it pulls in just for that block). Keep `<ProjectBlastHistory />` as the single source of truth on the page.

No DB, RLS, edge-function, or business-logic changes. Frontend-only.
