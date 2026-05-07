---
name: Accessibility & i18n Enforcement
description: Global accessibility statement page (/accessibility), accommodation form via FeedbackService (category=Accessibility), reduced-motion CSS guard, LiveAnnouncer + route announcer, BDD scenarios A-01..A-20.
type: feature
---
- `/accessibility` route renders the full Accessibility Policy + a "Report a barrier / Request accommodation" form. Submits via `FeedbackService.submit(... "Accessibility" ...)`.
- Footer links to `/accessibility` on every layout.
- Global reduced-motion CSS guard in `src/index.css` short-circuits all animations/transitions when `prefers-reduced-motion: reduce`.
- `<LiveAnnouncer />` mounted in every AppLayout return; `useRouteAnnouncer()` announces page title on route change. Use `announce(msg, "polite"|"assertive")` or `useAnnounce()`.
- BDD scenarios A-01..A-20 live in `bdd_scenarios` under `feature_area = 'Accessibility'` with tri-layer Then-clauses.
- Accessibility training completions tracked in `accessibility_training_completions` (user reads own; admins read all).
