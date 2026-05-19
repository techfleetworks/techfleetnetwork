# Universal information architecture: bigger card titles everywhere

## The target hierarchy
| Role | Component | Tag | Size |
|---|---|---|---|
| Page title | `PageTitle` | `h1` | 48 px Futura Bold |
| Page subtitle (lede under H1) | `SubsectionTitle` | `h3` | 24 px Futura Bold |
| **Card title** | `CardTitle` (shadcn) | **`h2`** | **36 px Futura Bold** |
| Card subtitle | `CardDescription` (shadcn) | **`h3`** | 24 px Futura Bold |
| Card body | `<p>` via `Body` | `p` | 16 px Poppins |

## Strategy — one source of truth, not 100 page edits

Instead of touching every page, **rewrite the two shadcn primitives** (`CardTitle`, `CardDescription` in `src/components/ui/card.tsx`) to render the Futura H2 / H3 styles. Every Card in the system — 57 `CardTitle` + 31 `CardDescription` usages across 32 files — automatically picks up the new architecture in a single change.

For body copy inside cards, **add a lint-style audit pass** that replaces raw `<p className="text-sm/text-muted-foreground">…</p>` inside `<CardContent>` with the `<Body>` typography wrapper. Same for stray `<h3 className="...">` inside cards → `<CardDescription>`.

## Step 1 — Rewrite the shadcn Card primitives (1 file)

`src/components/ui/card.tsx`:
- `CardTitle` becomes polymorphic, defaults to `h2`, renders with the same classes as `SectionTitle` (36 px Futura Bold, clamped responsive). Accept an `as` prop so the rare tight surface (popover, metric tile, dialog) can step down to `h3`/`h4` without losing semantics.
- `CardDescription` becomes `h3` and renders with the same classes as `SubsectionTitle` (24 px Futura Bold). Same `as` escape hatch.
- Keep export signatures identical so no import changes are needed.

This alone delivers the universal hierarchy for every Card already in the system — Dashboard widgets, Recruiting Center cards, System Health tiles, Quest cards, Project cards, Application cards, Admin panels, **all of them**.

## Step 2 — Triage the tight surfaces (escape hatch, ~10 files)

H2 at 36 px will overflow inside small surfaces. We'll audit and apply `as="h3"` (or `h4`) only where the card is intentionally compact:
- `src/components/ui/popover.tsx` consumers (Universal Search results, header popovers)
- `src/components/ui/dialog.tsx` content cards (`DialogTitle` is separate — untouched)
- System Health metric tiles (already use `CardTitle` for KPI labels — those want `as="h4"`)
- Dashboard sidebar widgets (`NotificationsBell`, `ConnectivityPill` cards)
- Sidebar collapsed widgets

We'll grep for `<CardTitle` in each, screenshot-spot-check, and add `as="h3"` / `as="h4"` only where the visual breaks. All others stay default H2.

## Step 3 — Card body copy: replace raw `<p>` with `<Body>` (audit pass)

Run a scoped grep across all files that import from `@/components/ui/card`:
```
rg -l "from \"@/components/ui/card\"" src
```
For each, replace patterns like:
- `<p className="text-sm text-muted-foreground">` inside `<CardContent>` → `<Body className="text-muted-foreground">`
- `<p className="text-xs ...">` for metadata → `<Caption>`
- Raw `<h3>`/`<h4>` inside cards → `<CardDescription>` or `<SubsectionTitle>`

This is mechanical. We do it in batches by page area:
1. Landing + Auth (already done — reference)
2. Dashboard + Journey (active projects, quests, certifications, profile)
3. Project Openings + Applications + Status pages
4. Admin: Recruiting Center, Applications Review, Clients & Projects, Class Approval, Banner Management, Project Blasts
5. System Health (Triage, Fleety, Performance, Privacy, Email, Content tabs)
6. Resources (Guidance, Explore, Handbooks, Templates) + Events + Network Activity
7. Feedback, Unsubscribe, Privacy/Cookies/Accessibility, DSAR, Account settings, Notifications management

## Step 4 — Single ESLint rule + smoke test to lock it in

- Add an ESLint rule `tf-typography/no-raw-headings-in-cards` that flags raw `<h1..h6>` and `<p>` with size classes inside any `<CardContent>` / `<CardHeader>` block, suggesting the right typography component.
- Add a smoke test `src/test/smoke/card-typography.smoke.test.tsx` that mounts each Card primitive and asserts `CardTitle` renders as `<h2>` and `CardDescription` as `<h3>` by default.

This guarantees no future page can drift out of the standard.

## Out of scope
- The two `typography.tsx` exports (`Display`, `PageTitle`, `SectionTitle`, `SubsectionTitle`, `CardTitle`, `Lede`, `Body`, `BodySmall`, `Caption`) stay as-is — they're already correct. We only rewire the shadcn Card primitives to reuse those styles.
- No color, spacing, or layout changes.
- AG Grid headers, sidebar nav labels, toast titles, and form field labels are not "card titles" and stay on their current sizes.

## Effort estimate
- Step 1 (primitives): ~5 min, 1 file, zero risk if the `as` escape hatch is added simultaneously.
- Step 2 (tight-surface overrides): ~15 min after visual spot-check.
- Step 3 (raw `<p>`/`<h*>` → typography components across pages): the big chunk — done in batches per area, ~30 files touched.
- Step 4 (lint + smoke): ~10 min, locks the standard.

Total: one shipped change set covering every page in the system, with a guardrail that prevents regression.
