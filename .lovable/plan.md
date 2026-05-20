# Old-Style Card Audit + Universal Fix Plan

## Why we still see old cards

The auto-retrofit in `src/index.css` (lines 343–368) only upgrades boxed containers that combine **`bg-card` OR `bg-background`** + `border` + `rounded-{md,lg,xl,2xl,3xl}`. Anything boxed with `bg-muted/*`, `bg-primary/5`, `bg-popover`, `bg-background` without `rounded-lg+`, or a plain `border rounded`/`rounded-md` with no bg token slips through and renders as a flat shadcn rectangle.

## Inventory of old-style boxed elements found (54 surfaces across 33 files)

Grouped by intent so we apply the right fix to each.

### A. Genuine card/panel surfaces that should be tf-card (24)
- `src/components/DiscordUsernameTutorial.tsx` (3 screenshot frames + 1 tip box) – lines 98, 129, 167, 181
- `src/pages/LoginPage.tsx` info banners – 343, 350
- `src/components/CurrentMembershipBanner.tsx:55`
- `src/components/DiscordInviteBanner.tsx:60`
- `src/components/MembershipTiersGrid.tsx:275` (tier note)
- `src/pages/UpdatesPage.tsx:271` (empty-state)
- `src/components/MemberWorldMap.tsx:127` (map frame)
- `src/components/NotificationBell.tsx:282` (empty-state)
- `src/pages/ChatPage.tsx:356` (transcript pane)
- `src/pages/EditProfilePage.tsx` – 510, 587
- `src/components/ProfileEditPanel.tsx:533`
- `src/components/system-health/KnownIssuePanel.tsx` – 121, 179
- `src/components/system-health/PrivacyRequestsTab.tsx:206`
- `src/components/system-health/IncidentsTab.tsx` – 205, 239, 243
- `src/components/system-health/TriageTab.tsx:293`
- `src/pages/ProjectFormPage.tsx` – 436, 616
- `src/pages/RegisterPage.tsx:359`
- `src/components/resources/ExploreResultsSection.tsx:63`
- `src/components/VideoRecorder.tsx` – 471, 504
- `src/components/WelcomeDialog.tsx` – 50, 80 (info tiles)
- `src/components/quest/QuestPreviewDialog.tsx:100`
- `src/components/quest/QuestOverview.tsx:81` (empty-state)
- `src/components/profile/ProfileDiscordConnector.tsx:277` and `src/pages/ConnectDiscordPage.tsx:801` (Discord member result rows)
- `src/components/recruiting/ProjectBlastComposer.tsx:121`
- `src/components/admin/SystemHealthWidget.tsx` – 193, 235
- `src/components/general-application/SectionReview.tsx:84`
- `src/components/admin/DiscordRoleAssignment.tsx:185`
- `src/components/resources/GuidanceEmbed.tsx:307`
- `src/pages/AdminIngestPage.tsx` – 142, 189
- `src/components/clients/ClientsTab.tsx:426` (logo placeholder, compact variant)
- `src/components/GenericCoursePage.tsx:813` (text-version accordion)

### B. Segmented control / button group shells – keep flat, mark `data-no-card` (6)
- `ProjectOpeningsPage.tsx:382`, `UpdatesPage.tsx:144`, `clients/ProjectsTab.tsx:137`, `clients/ClientsTab.tsx:329`, `SubmittedApplicationsTab.tsx:388`, `EventsPage.tsx:140`

### C. Dropzones / uploaders – keep dashed look, mark `data-no-card` (3)
- `WorkshopDocsUploader.tsx:171`, `ClassImageUpload.tsx:91`, `ClientsTab.tsx:426` (already in A as compact)

### D. Small chips/kbd/captcha widgets – not cards, keep as is (5)
- `ShortcutCheatsheet.tsx:70`, `UniversalSearch.tsx:381`, `auth/AuthCaptchaField.tsx:16`, `auth/TurnstileChallenge.tsx:167`, `events/WeekCalendar.tsx:348`

### E. Icon-button shells (AG Grid toolbar, mobile nav) – keep button styling (4)
- `AgGridImpl.tsx` 251/263/276, `FlowMobileNav.tsx:18`, `DiscordRolePicker.tsx` 185/260 (popover internal), `ConnectDiscordPage.tsx:581` (chip), `GenericCoursePage.tsx:726` (full-screen dialog)

## Fix strategy (two passes, no behavior change)

### Pass 1 — broaden the safety net in `src/index.css`
Extend the auto-retrofit `:where(...)` selector so it also catches the three additional surface tokens we actually use for cards:
- add `[class*="bg-muted"]`
- add `[class*="bg-primary/"]` (covers `bg-primary/5`, `/10`, `/20` callouts)
- add `[class*="bg-popover"]`
- add `rounded` and `rounded-md` to the radius set (currently lg+ only)

Keep every existing `:not(...)` exclusion (Radix, dialogs, menus, toasts, `[data-no-card]`, chart/sonner, etc.) so popovers/dropdowns/kbd/badges are still safe. Add one more `:not([class*="border-dashed"])` so dropzones keep their dashed look.

This single CSS change retrofits Group A automatically with zero file edits.

### Pass 2 — surgical opt-outs for Groups B, C, D, E
Add `data-no-card` to the 18 elements above that are intentionally not cards (segmented controls, dropzones, kbd chips, icon buttons, captcha shells, calendar event chips, AG Grid toolbar buttons, full-screen dialog content). One-line edits each.

### Pass 3 — guardrails
1. Add an ESLint rule (`no-restricted-syntax`) that flags new `<div className="… border … rounded-…">` without `bg-card`, `bg-background`, `tf-card`, or `data-no-card`, with autofix suggestion to use `<Card>`.
2. Add a CSS-portability smoke test (`src/test/smoke/card-style.smoke.test.tsx`) that mounts a `bg-muted border rounded-md` div and asserts the computed `border-top-left-radius` is `40px` (proves retrofit fires).
3. BDD scenarios in `bdd_scenarios`:
   - CARD-RETROFIT-001 muted callout renders tf-card geometry
   - CARD-RETROFIT-002 primary/5 banner renders tf-card geometry
   - CARD-RETROFIT-003 `[data-no-card]` segmented control stays flat
   - CARD-RETROFIT-004 dashed dropzone stays dashed
   - CARD-RETROFIT-005 kbd / Radix popover content unaffected
4. Memory update: add a Core rule "every boxed surface must end up tf-card or carry `data-no-card`; new components prefer `<Card>`".

## Technical notes
- No component API changes; the existing `<Card>` primitive and three variants stay the source of truth.
- The expanded selector still respects `prefers-reduced-motion` and all WCAG contrast tokens (border 3px, inset glow tokens unchanged).
- Zero database / edge-function impact.
- Estimated diff: ~20 lines in `index.css`, 18 single-attribute additions across 14 files, 1 new ESLint rule, 1 smoke test, 5 BDD rows.

## Out of scope
- No change to `<Card>` variants, radii, or color tokens.
- No change to Radix popover/menu/dialog surfaces.
- No mass restyling of chips, badges, kbds, or AG Grid internals.
