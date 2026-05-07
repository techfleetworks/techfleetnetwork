# Known Accessibility Limitations

This file is the canonical, machine-readable list of accessibility issues
the Platform is **aware of and actively remediating**. The
`/accessibility` route surfaces a collapsible "Known limitations" section
that mirrors this content so users with assistive technology can see
exactly what we're working on, and the corresponding `bdd_scenarios`
under `feature_area = 'Accessibility'` track each acceptance criterion.

When you add an item, include:
 - **Surface** — page / component / integration affected
 - **Barrier** — what the user experiences
 - **WCAG SC** — failing or at-risk Success Criterion
 - **Workaround** — the user-facing alternative (or "none — please report")
 - **Target** — calendar quarter we plan to ship the fix
 - **Owner** — squad / individual

When you fix one, **delete the row** (don't strikethrough — keep the file
short and signal-rich) and let the PR-gated a11y suite confirm the
regression test now passes.

---

## Open

| Surface | Barrier | WCAG SC | Workaround | Target | Owner |
| ------- | ------- | ------- | ---------- | ------ | ----- |
| AG Grid card view on mobile | Some virtualized rows are not announced when the user pages through with a screen reader | 4.1.2 | Switch to Table view (toolbar toggle) — read order is preserved there | 2026-Q3 | Platform UI |
| Discord embed widget | Third-party iframe — focus order and contrast are vendor-controlled | 2.4.3 / 1.4.3 | Open the linked Discord channel directly via "Open in Discord" button | Tracking vendor VPAT | Integrations |
| Machine-translated locales (non-vetted languages) | Strings labeled "machine-translated" may be slightly awkward; UI strings in cached `i18n_translations` rows are auto-generated | 3.1.5 | Use one of the 18 vetted locales; submit corrections via `/accessibility` | Ongoing | i18n |

## Out of scope (documented & accepted)

| Surface | Reason | Notes |
| ------- | ------ | ----- |
| External vendor admin consoles (Stripe, Discord, Google Meet) | We don't ship the UI | Tracked separately via vendor VPATs |
| Browser extensions modifying our DOM | Unsupported | Recommended ATs listed in `/accessibility` |
