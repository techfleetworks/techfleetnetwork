# Rename "Public Events" → "Onboarding" + Luma embed

## Scope
Frontend-only change to `src/pages/EventsPage.tsx`. No backend, no DB, no edge functions.

## Changes

1. **Tab rename** (`eventTabs` array):
   - `value: "public"` → `value: "onboarding"`
   - `label: "Public Events"` → `label: "Onboarding"`
   - Keep `Globe` icon (or swap to a more onboarding-appropriate icon — keeping Globe for minimum churn).

2. **Tab content** (`<ResponsiveTabsContent value="public">` → `value="onboarding"`):
   - Remove `TimezoneSelector`, `EventsSyncHealthBanner`, and `CommunityEventList` (those belong to the Community tab).
   - Replace with a responsive Luma iframe embed:
     ```tsx
     <div className="w-full overflow-hidden rounded-lg border bg-card">
       <iframe
         src="https://luma.com/embed/calendar/cal-Iy1vN2k9O1VcEBC/events?tag=Onboarding"
         title="Tech Fleet onboarding events calendar"
         className="w-full h-[600px] border-0"
         loading="lazy"
         allowFullScreen
       />
     </div>
     ```
   - Wrapper makes it responsive (full width instead of fixed 600px) and uses semantic tokens (`border`, `bg-card`).
   - `title` attribute satisfies WCAG 2.0 / 4.1.2 for iframes (replaces the invalid `aria-hidden="false"` from the source snippet).

3. **No changes** to Community Events tab, sync-health banner, week/list view, or timezone logic.

## BDD
Update existing `EVT-002` scenario (currently "Public Events Luma embed loads") — title already matches. Add new scenario `EVT-004`: "Onboarding tab renders Luma iframe with accessible title and lazy loading" stored in `bdd_scenarios` via migration.

## Files
- `src/pages/EventsPage.tsx` — tab label/value + content swap
- One migration to insert `EVT-004` BDD scenario (tri-layer: [UI] iframe present with title, [DB] no DB writes expected, [Code] iframe src matches Luma calendar URL)
