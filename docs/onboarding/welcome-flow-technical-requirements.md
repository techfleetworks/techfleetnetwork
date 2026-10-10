# Welcome Flow — Technical Requirements

> **Feature:** Improve the Onboarding for New Platform Members ("Welcome Flow")
> **Epic:** Onboarding · **Owner:** Morgan Denner · **Status:** Draft — technical requirements (pre-build)
> **Repo:** `github.com/techfleetworks/techfleetnetwork` · **Branch:** `feat/welcome-flow-onboarding` (off `origin/main` @ `afa0b205`)
> **Date:** 2026-09-30

| | |
|---|---|
| **Source of truth (functional)** | `Improve Onboarding Flow - User Requirements.pdf` (verbatim flow reproduced in §4) |
| **Design** | Figma `AqnScC6nnGsXUQHWWuL6Lm`, latest prototype page node `8770:8597` — **READ 2026-10-09** (REST API, read-scope `FIGMA_TOKEN`; rotate it). *Five screens (Welcome → Why it's helpful → Newsletter → Profile → Start), two-column desktop layout, check-style progress, Back/Next, **unDraw-style SVG illustrations + a "peep" character** which **supersede** the legacy `welcome-slide` raster (re-export to `src/assets/welcome-flow/` — §13). Field list confirmed: First/Last/Country/Portfolio/LinkedIn (State not collected — P11). §15.2 / Appendix A.* |
| **Grounding** | Full codebase map of the seams this feature touches (auth/routing, profile, Email Octopus, dashboard, design system, arch gate) |
| **New ADRs to be written (build phase)** | **ADR 20261009-welcome-flow-gate** mandatory Welcome-Flow gate (ProtectedRoute seam, **flagless 100% launch**, legacy-wizard retirement, no new service boundary) · **ADR 20261009-welcome-flow-data-model** Welcome-Flow profile data model & ownership (`welcome_flow_completed_at` set-once, single writer; step-d goals removed, P9) · **ADR 20261009-welcome-flow-eo-extension** Email-Octopus ownership extension (marketing-email override + additive `p_source='welcome_flow'` + erasure cascade; forward-links, does **not** supersede, ADR-0017). **IDs use the repo's date-prefix convention (`YYYYMMDD-slug.md`, merged in PR #414 — see `docs/adr/README.md`), which makes ADR-number collisions structurally impossible; no 4-digit number is minted. The three share the date 20261009 (allowed — date ADRs are unique by filename, not grouped by day).** |
| **Governing existing ADRs** | 0013 consent, 0015 MUI design system, 0017/0018 Email Octopus marketing source-of-truth + scope separation, 0019 architecture gate, 0026 expand/contract migrations, 0036 schema gate, 0045 migrations auto-apply on merge, 0050 live-derived stats (the Courses completion stat, §6.13), 0056 projects column grants (does **not** apply to profiles). *(ADR-0021 feature flags no longer governs — the launch is flagless, §11.2.)* |

This document was produced by applying the enterprise‑architecture skill set (enterprise‑architecture‑standards, owasp‑secure‑coding‑bdd, compliance‑data‑lifecycle, sre‑operational‑readiness, comprehensive‑test‑strategy + bdd‑comprehensive‑testing, release‑deployment‑safety, universal‑accessibility‑wcag, usability‑ux‑universal‑design, universal‑browser‑device‑support, architectural‑decision‑records) to the graded codebase. Every design claim is grounded in a real file (cited `path:line`). **It was then re-audited in fresh context — one subagent per discipline, each loading the actual skill and hunting gaps against this feature; their verified corrections and additions are woven into the sections below, and Appendix B is the discipline → section coverage matrix that proves none is skipped.**

---

## Table of Contents

1. Overview & Goals
2. User Stories & Success Metrics
3. Scope, Assumptions & Glossary
4. Functional Requirements — the flow (PDF steps a–g → 5 designed screens)
5. System Architecture & Boundaries
6. Data Model, Ownership & Migrations
7. Security & Threat Model
8. Compliance & Data Lifecycle
9. Reliability & Operational Readiness
10. Test Strategy
11. Release & Rollout
12. Accessibility, UX & Cross‑Platform
13. Design System & Asset Integration
14. Architecture Decision Log
15. Open Questions, Product Decisions & Pre‑Build Blockers
16. Implementation Plan (phased)
17. Definition of Done

---

## 1. Overview & Goals

Tech Fleet's first‑iteration onboarding is self‑guided and skippable, which leaves new members overwhelmed and unclear on how to start. At the same time the organization has a new mailing list to grow. The **Welcome Flow** replaces the current ad‑hoc onboarding with a single, guided, **mandatory** experience that every member walks through exactly once.

**Goals (from the requirements):**
- **G1 — Help new members make informed decisions about how to start** on the platform, so they spend their training time wisely and retention improves.
- **G2 — Scale the mailing list** by offering a newsletter opt‑in inside the flow, synced to Email Octopus.

**What we are building:** a routed, full‑screen, un‑skippable "Welcome Flow" shown to **all first‑time logins**, and **once** to each existing member on their next sign‑in. It is tracked as **complete‑once** (never shown again after completion). It guides members through who Tech Fleet is and why the training helps, captures their goals and profile basics (persisted to their profile and kept in sync), offers a newsletter opt‑in, and routes them to a sensible first action. On completion a **"Welcome" card** appears in the Dashboard **"Get Started"** section (not in Courses).

**Non‑negotiable properties:** mandatory · un‑skippable · shown exactly once (server‑tracked, cross‑device) · never locks a user out · single‑owner data with bidirectional flow↔profile sync · reuses the existing Email Octopus integration and the TFDS design system.

---

## 2. User Stories & Success Metrics

**User stories (verbatim from the requirements):**
- **US1** — *As a new member, I want to be able to make informed decisions about how to start so that I can spend my time wisely in Tech Fleet training.*
- **US2** — *As a product owner, I want users to be able to make informed decisions about how to start so that we can build better retention for new members.*
- **US3** — *As a product owner, I want to scale our mailing list so that we can sustain the organization.*

**Success metrics (proposed — confirm targets with product):**

| Metric | Definition | Target (initial) |
|---|---|---|
| Flow completion rate | % of gated members who reach `welcome_flow_completed_at` | > 95% within first session |
| Wrongful lockout rate | members stuck unable to complete or bypass (from SRE SLIs, §9) | **0** (hard SLO) |
| Newsletter opt‑in rate | % of completers who opt in at step (e) | baseline to establish; growth is G2 |
| First‑action rate | % who click a step (g) CTA rather than closing | track; higher = better guidance (G1) |
| Time‑to‑complete | median flow duration | keep low (cognitive‑load proxy, §12) |

---

## 3. Scope, Assumptions & Glossary

**In scope (v1):** the mandatory gate; the **five designed screens** on TFDS (Welcome · Why it's helpful · Newsletter · Profile · Start — §4); the `welcome_flow_completed_at` completion flag; the step‑(e) newsletter opt‑in via the **existing** Email Octopus RPC (signup‑email default, editable); step‑(f) profile Basic Information persistence via `ProfileService`; the fixed step‑(g) CTAs; the Dashboard "Welcome" completion card; retirement of the legacy skippable `/welcome` wizard and the localStorage welcome dialog; flagless 100% launch (no canary, no kill switch — §11.2, residual risk accepted); the Welcome Flow as a re-enterable Courses first-tab entry + a live completion stat (§4.11); ADR 20261009-welcome-flow-gate + ADR 20261009-welcome-flow-data-model + ADR 20261009-welcome-flow-eo-extension. **Removed (P9):** step‑(d) goals toggles, the goals column + Preferences sync, and the conditional step‑(g) CTAs.

**Scope decision pending product (see §15):** the **step‑(e) override mailing‑list email**. It is required by the PDF but is a self‑contained sub‑feature with its own ownership, validation and GDPR‑erasure work (ADR 20261009-welcome-flow-eo-extension). Recommended as **PR5 / a fast‑follow** so it cannot delay or destabilize the core gate + flow. If deferred, step (e) ships with the signup email only.

**Out of scope:** rebuilding the Email Octopus pipeline; changing the frozen auth layer; the contract‑phase cleanup of legacy code (a later PR after GA bake); any new microservice or edge orchestration function.

**Assumptions:** ~767 existing production users; Supabase Postgres 15; migrations auto‑apply on merge to `main` (ADR‑0045); Cloudflare Pages deploys the frontend on push to `main`; the Email Octopus integration is live and its secrets are configured in prod (to be confirmed, §15); **Supabase PITR (point-in-time recovery) is enabled on the prod project** (confirm as a release gate — §9.7 / §8.9).

**Non-functional requirements (NFRs) — stated up front, not left implicit (enterprise-architecture-standards):**
- **Availability / no-wrongful-lockout:** the login-gated path carries a hard SLO — S1 ≥ 99.95% (§9.1); wrongful-lockout target = **0**.
- **Cutover concurrency:** at launch (flagless, 100%), every existing member (~767; headroom to 10k) issues one profile read + up to one completion write on their next sign-in. **With no ramp to spread it, peak concurrency ≈ natural peak-logins/min × fraction-still-incomplete** (the login distribution spreads it, but it is NOT ramp-bounded). Targets: completion-write p95 < 400 ms and **zero PgBouncer checkout timeouts at the daily sign-in peak**; quantify against the prod connection limit **before launch** (§9.7, §5.6).
- **Step latency:** p95 step→step transition < 400 ms (S5, §9.1; how it is measured vs. gated is pinned in §10.7).
- **Growth horizon:** correct and within headroom at 10k users with no architecture change — the gate is a client-side O(1) read and writes are single indexed rows.

**Glossary:**
- **Welcome Flow** — the new mandatory onboarding described here.
- **The gate** — the route guard that redirects authenticated users to `/welcome` until the flow is complete.
- **Complete‑once** — shown until finished, then never again; tracked server‑side by `welcome_flow_completed_at`.
- **d1 / d2** — the two step‑(d) options that drive step‑(g) conditional CTAs: d1 = "Learn in classes, connect with peers, develop leadership, build skills" → Project Openings; d2 = "Teams, practice agile" → Courses.
- **TFDS** — the Tech Fleet Design System (`@/design-system`, MUI‑owned layer, ADR‑0015).

---

## 4. Functional Requirements — the flow (PDF steps a–g → 5 designed screens)

This section reproduces the required behaviour with testable acceptance criteria (`AC‑*`). **Figma has now been read** (REST API, page `8770:8597` "Welcome Flow"); the former `[Figma]` placeholders are replaced with the actual copy/fields, and the real design is reconciled against the PDF's seven steps here.

> **⚠️ Design ↔ PDF reconciliation — read first; it changes scope.** The PDF describes **seven** steps (a–g). The **final designed "Welcome Flow"** (the page you linked, `8770:8597`) is **five screens**: **Welcome · Why it's helpful · Newsletter · Profile · Start**. Two differences are now **DECIDED by product (confirmed 2026-10-07)** and are reflected throughout this doc: **step (b) is folded into Welcome** (content changed, no separate screen) and **step (d) is removed entirely** — so the `welcome_flow_goals` column, its bidirectional Preferences sync, and the conditional step-(g) d1/d2 CTAs are **OUT OF SCOPE**. The only new profile fact is **`welcome_flow_completed_at`** (no `state` column — P11 resolved: step (f) syncs to existing columns only; plus the override-email table if ADR 20261009-welcome-flow-eo-extension ships). Any goals/d1-d2/toggle references that remain in later sections are **superseded by this decision** and apply only if it is reversed. Detail (P8–P9, §15.1):
> - **Step (b) "What's an empowered team, really?"** is **not a separate screen** in the final cut — it survives only in earlier iteration pages (copy captured in §4.4) and its idea is **folded into the Welcome screen** ("We help people develop experience on empowered teams").
> - **Step (d) "What do you want to do here?" — the goal toggles + d1/d2 → Project Openings/Courses routing — does NOT exist in ANY design.** The exact PDF options ("Learn in classes…", "Teams, practice agile") appear nowhere in Figma. The nearest designed artifact is a separate **Readiness Assessment** flow (a 1–5 *certainty* scale for "Learning Goals"/"Professional Goals" + free text) — a **different mechanism** on a different page. **So the whole step-(d) preferences column, its bidirectional Preferences sync, and the conditional step-(g) CTAs are unspecified by the design** (§4.6 carries the decision).
>
> The five designed screens use a **two-column desktop layout** (left Tech Fleet branding panel + right content), a **check-style progress indicator**, **Back/Next** nav, and **unDraw-style SVG illustrations + a "peep" character** (not the legacy `welcome-slide` rasters — §13). The likely interaction order is Welcome → Why it's helpful → Newsletter → Profile → Start; confirm against the prototype links (REST node geometry does not encode flow order).

### 4.1 The mandatory gate

- **FR‑G1** All first‑time logins see the Welcome Flow before any other authenticated surface. It **cannot be skipped or dismissed**; the member must go through the whole flow.
- **FR‑G2** Every **existing** member receives the flow **once**, on their next sign‑in after release. Once completed, they never see it again — on any device. **No role is exempt: all members, all teachers, and all admins are gated (P2, confirmed).** (This is why the a11y/CI fixture admin must be welcome-complete — §15.3 — and why, under the flagless launch, the frontend bundle revert is the rollback and the admin `resetWelcomeFlow` the only per-user break-glass, §11.)
- **FR‑G3** Completion is a **server‑tracked** fact (`welcome_flow_completed_at`), never localStorage; "never again" holds across devices and browsers.
- **FR‑G4** The gate must **fail safe**: a transient profile‑read failure must neither trap the user on a spinner forever nor let an un‑completed user bypass — it shows a retry/error state (§5 3a, §7 §1, §9 §0).

| AC | Criterion |
|---|---|
| AC‑G1 | With `welcome_flow_completed_at IS NULL`, navigating to any authenticated route redirects to `/welcome`. |
| AC‑G2 | There is no control (button, link, gesture, browser‑back, deep‑link) that reaches a non‑allowlisted authenticated route while the flow is incomplete. |
| AC‑G3 | After completion, no authenticated route ever redirects to `/welcome`, in a fresh session/device. |
| AC‑G4 | On a simulated profile‑fetch failure the user sees a retry state; on retry success the correct gate decision is made; the user is never silently allowed through nor looped. |
| AC‑G5 | The gate is evaluated after MFA enforcement (AAL2 challenge, if any, comes first) and wins over the default `/dashboard` landing (no dashboard↔welcome bounce). |

### 4.2 Flow structure & navigation

- **FR‑N1** The flow is a routed, full‑screen page at `/welcome`. **As designed (final), the screens are: Welcome → Why it's helpful → Newsletter → Profile → Start** (confirm order against the prototype links). The PDF's step (b) is folded into Welcome and step (d) is undesigned — see the reconciliation callout above and §4.4/§4.6. Layout is **two-column on desktop** (left branding panel, right content) collapsing to **single column on mobile** (§13).
- **FR‑N2** The member can move forward and back within the flow; progress is shown. There is **no Skip control**.
- **FR‑N3** Progress and any entered data survive a refresh or mid‑flow disconnect with no data loss (autosave; §12 §7).

| AC | Criterion |
|---|---|
| AC‑N1 | Screens appear in the designed order; the flow occupies the full screen (100dvh, safe‑area) — two-column on desktop, single column on mobile. |
| AC‑N2 | No "Skip"/"Skip for now"/close affordance exists anywhere in the flow. |
| AC‑N3 | Refreshing mid‑flow returns the member to their place with previously entered values intact. |

### 4.3 Step (a) — Welcome
- **FR‑a1** Welcome screen. **Figma copy:** heading **"Welcome to Tech Fleet's Platform"**; body **"Tech Fleet is a public charity nonprofit. We help people develop experience on empowered teams."** (this body carries the step-(b) empowered-team idea). Illustration: unDraw check/line-art; **Back/Next** nav (Back disabled on the first screen).
- **AC‑a1** Renders the welcome content and a **Next** CTA; no data is written.

### 4.4 Step (b) — "What's an empowered team, really?" — *DECIDED: removed as a screen; content changed & folded into Welcome (P8)*
- **FR‑b1** **Not a screen.** Product confirmed (2026-10-07) the content was changed and folded into the Welcome screen (§4.3). The earlier-iteration copy — heading "What's an empowered team, really?", subhead "Empowered teams run the show:", six traits (*They decide together · They fail and learn · They share leadership · They experiment · They support growth · They trust each other*, with a "peep" character) — is retained here **only as reference/source** for the Welcome copy, not as a build target.
- **AC‑b1** *(n/a — (b) is not a standalone screen).*

### 4.5 Step (c) — "Why is our training helpful?" (designed as the "Why it's helpful" screen)
- **FR‑c1** Informational screen. **Figma copy:** heading **"We prepare you for a changing world"** with five items (unDraw spiral icon each): *Share ownership · Decide together · Practice · Adapt · Build influence*. These are **display-only**, NOT selectable toggles. Back/Next nav.
- **AC‑c1** Renders the heading + the five items and advances; **no data is written** (they are not inputs).

### 4.6 Step (d) — "What do you want to do here?" — *DECIDED: REMOVED (P9, confirmed by product 2026-10-07)*

**Step (d) is removed from the Welcome Flow.** Product confirmed it was taken out of the design; it exists in no artboard, and the PDF's options ("Learn in classes, connect with peers, develop leadership, build skills" / "Teams, practice agile") are not built. **Consequences, applied across this doc:**
- **No `welcome_flow_goals` column** (§6.3 struck), **no `updateWelcomeGoals`**, **no canonical option-key constant** (§6.6 struck), **no step-(d) ↔ Preferences bidirectional sync** (§6.4 now governs only the step-(f) profile fields).
- **No conditional step-(g) CTAs** (d1/d2 → Project Openings/Courses; §4.9 FR‑g2 struck).
- The only new profile fact from the flow is **`welcome_flow_completed_at`** (no `state` column — P11 resolved; plus the override-email table, ADR 20261009-welcome-flow-eo-extension).
- The goal-related certainty screens seen in iterations ("Learning Goals"/"Professional Goals" = a 1–5 certainty scale + free text) belong to a **separate Readiness Assessment** feature, not this flow; if product ever wants goal capture here, it is a new feature with its own data model + ADR.

*(FR‑d*/AC‑d* intentionally removed. There is no step-(d) screen, data, or test.)*

### 4.7 Step (e) — "Sign up to the newsletter" (designed as the "Stay Updated" screen)
- **FR‑e1** A newsletter opt‑in **Switch, OFF by default** (heading **"Stay Updated"**). The Figma consent line ("…not shared with any third parties") is **replaced** — it is inaccurate because Email Octopus IS a subprocessor (P10). **Approved copy:**
  - **Toggle label:** "Sign me up for the Tech Fleet newsletter: news, updates, and occasional promotions."
  - **Consent / helper line:** "You'll get a confirmation email to finish signing up, and you can unsubscribe any time. We deliver the newsletter through our email provider, Email Octopus, and share your email address with them only for that purpose. We never sell your information or share it for anything else." — followed by a **"Read our privacy policy"** link.
- **FR‑e2** The opt‑in syncs with the **existing** Email Octopus integration; marketing consent stays owned by EO — **no marketing state on `profiles`** (ADR‑0017). **The EO list uses double opt-in (confirmed, P5):** the in-flow toggle records *intent*; the subscription completes only when the member clicks EO's confirmation email. So the copy promises a confirmation email (FR‑e1), and the UI must **never** assert "You're subscribed" — at most "Check your inbox to confirm."
- **FR‑e3** The email field **defaults to the member's platform signup email** — **Figma label "The email we will use"**, placeholder **"[ email from account ]"** (prefilled, editable).
- **FR‑e4** That the field is **editable is the override** the PDF requires (self‑contained sub‑feature — ADR 20261009-welcome-flow-eo-extension, §6.7/§8.3; fast‑follow per P1; if deferred, the field is read‑only / signup‑email‑only).
- **FR‑e5 (P10 — resolved)** The inaccurate "no third parties" line is replaced by the approved copy in FR‑e1 (which names Email Octopus as the subprocessor). The privacy notice / DPIA (§8) and the privacy-runbook (§8.9) must state the same.

| AC | Criterion |
|---|---|
| AC‑e1 | The newsletter toggle is OFF on first view; leaving it off and completing subscribes no one and creates no Email Octopus contact. |
| AC‑e2 | Opting in records intent through `set_my_marketing_subscription`; the value matches the Notification Settings / profile surface (single source of truth). |
| AC‑e3 | The email field is prefilled with the platform signup email ("The email we will use"). |
| AC‑e4 | *(If override in v1)* A member can enter a different, validated email; stored in its own owner (not `profiles`), reflected on reload, erased on account deletion (§8.3). Invalid emails rejected before any subscribe. |
| AC‑e5 | The rendered consent copy does not falsely claim "no third parties"; it is consistent with the privacy notice/DPIA (P10). |

### 4.8 Step (f) — "Fill out your profile"
- **FR‑f1** Step (f) renders the member's **existing** profile Basic-Information fields and **syncs to the current columns — it adds none** (P11, confirmed: "profile already exists; sync to the current fields"). The Figma fields map to existing `profiles` columns: **First Name** → `first_name`, **Last Name** → `last_name`, **Country** → `country`, **Portfolio URL** → `portfolio_url`, **LinkedIn URL** → `linkedin_url` (verified present in `ProfileService`). **"State" is NOT collected** — the profile has no `state`/`region` column (verified), and P11 is "sync to current fields, add none"; surfacing State would be a separate profile-model change, out of scope here. (`timezone`/`scheduling_url` exist on the profile but the design does not surface them, so step (f) does not either.)
- **FR‑f1a (P11 — required vs optional, resolved)** **All step-(f) fields are optional to advance** — prefilled from the existing profile (FR‑f5), editable, never required to proceed. This reconciles the design's `*` marks with the DPIA "complete sharing nothing" invariant (§8.7): the `*` reads as "your saved value / recommended," not a hard gate. Validation runs **only when a field has a value** (e.g. a URL must be a valid URL), never "this is required".
- **FR‑f2** Entered information **MUST be stored on the profile under "Basic Information," which already exists**, via `ProfileService` (allow‑listed, sanitized) — never a raw write.
- **FR‑f3** Kept in **bidirectional sync** with the profile (same single‑owner rule as FR‑d3).
- **FR‑f4** Audit the fields and ensure nothing is missing; completeness is assessed against the existing `v_profile_readiness` view / `CompletenessMeter`.
- **FR‑f5** **Redundant Entry (WCAG 2.2 §3.3.7, Level A).** For an existing member, every Basic-Information field the step shows is **pre-populated from their current profile** (via the shared `ProfileService` / React-Query cache, FR‑f3) — the ~767 existing members must never re-type a name, country, timezone, or URL they already have on file. A field with no stored value renders empty; none renders blank over an existing value.

| AC | Criterion |
|---|---|
| AC‑f1 | Each surfaced field persists to its **existing** `profiles` column (`first_name`/`last_name`/`country`/`portfolio_url`/`linkedin_url`); **no new column is introduced** ("State" is not collected — P11). |
| AC‑f2 | Editing a value here is reflected on the profile edit page and vice‑versa. |
| AC‑f3 | Every collected field is present in both the zod schema and the `ProfileService` allow‑list (else it is silently dropped — a pre‑build check, §7). |
| AC‑f4 | An existing member with Basic Information on file sees those values **pre-filled** on step (f), not blank fields (WCAG 3.3.7 Redundant Entry). |
| AC‑f5 | A member can **advance step (f) with any or all fields blank** (optional to complete); a field with a value is still validated (e.g. URL shape), but emptiness never blocks advancement (DPIA invariant, §8.7). |

### 4.9 Step (g) — "Start onboarding today!"
- **FR‑g1** **Figma copy:** heading **"Start onboarding today!"**; body **"It's easy to get started. We show you all of the details. Click one of the options below to begin."**; a designed **"Onboarding course"** option (unDraw spiral) plus additional option graphics (un-texted in the export); footer nav shows **"Back"** and **"Take me home"**. The PDF's full CTA set — stacked, same style, never side-by-side — is:
  - "Take me home" → `/dashboard`  *(designed, as the footer CTA)*
  - "Join Discord" → `/courses/connect-discord`  *(PDF; not clearly in the export — confirm against the un-texted option graphics)*
  - "Finish Onboarding" → `/courses/onboarding`  *(the designed "Onboarding course" option)*
- **FR‑g2** *(REMOVED — step (d) was removed, P9.)* There are **no** conditional d1/d2 CTAs ("Project Openings" / "Courses"). Step (g) shows only the fixed CTAs in FR‑g1.
- **FR‑g3** Reaching/acting on step (g) completes the flow: the completion write happens and is **confirmed before navigation**; on failure the member sees a retry + support path (never navigate on an unconfirmed write — §7).

| AC | Criterion |
|---|---|
| AC‑g1 | The three base CTAs route to the exact paths above; buttons are vertically stacked. |
| AC‑g2 | *(REMOVED with step (d), P9)* — step (g) shows only the fixed CTAs (AC‑g1); no conditional routing. |
| AC‑g3 | Completion is persisted and confirmed before the member leaves the flow; a failed write keeps them in the flow with a retry, not a redirect loop. |

### 4.10 Completion & the Dashboard "Welcome" card
- **FR‑CARD‑1** Once the flow is finished, a new **"Welcome" card** appears in the Dashboard **"Get Started"** section, indicating completion. This **Dashboard card** must **not** appear in Courses (per the brief). *(Distinct from the Welcome Flow's own re-enterable Courses entry + completion stat — a separate, intended surface, §4.11.)*
- **FR‑CARD‑2** The card's completed state reads the same server flag (`welcome_flow_completed_at`) — it is a reflection, never a second copy.
- **FR‑CARD‑3** **Visibility (decided — resolves the former open question; see P3 / §5.3c / ADR 20261009-welcome-flow-gate Consequences):** the card renders inside the normal, user-hideable `core_courses` "Get Started" widget. Completion is already enforced server-side by the gate, so the card is a celebratory *reflection* with zero correctness impact if a member hides it; forcing it non-hideable would fight the `use-dashboard-preferences` owner for no benefit. If product (P3) later requires guaranteed visual confirmation, that ships as a **conscious, documented exception** to widget-hiding — not the default.

| AC | Criterion |
|---|---|
| AC‑CARD‑1 | After completion the "Welcome" card shows in Dashboard → Get Started, marked complete. |
| AC‑CARD‑2 | The Dashboard **completion card** never appears in the Courses listing (the Welcome Flow's own Courses entry, §4.11, is a separate, intended surface). |
| AC‑CARD‑3 | The card's completed state is driven by the server flag (verified by toggling the flag, not local state). |

### 4.11 Welcome Flow in Courses — re-entry, completion marker, and a completion stat

**New requirement (2026-10-09).** Beyond the mandatory gate, the Welcome Flow is **also a voluntary, re-enterable entry in Courses**, so anyone can revisit it.

- **FR‑CO1** The Welcome Flow appears as the **first entry in the first tab** of the Courses page (`src/pages/TrainingPage.tsx`), visible to **every authenticated user** (members, teachers, admins), rendered in the **same course-card component style** as the other courses. **Why this is the durable access point:** the Dashboard "Welcome" card lives in the Get Started widget, which **collapses/empties once a member has completed all Get Started courses** — so that card is **not** a reliable permanent way back to the flow. The Courses first-tab/first-card placement guarantees the flow is **always reachable for replay** regardless of Get Started state; it is the primary durable surface, with the Dashboard card as a transient celebratory reflection (§4.10).
- **FR‑CO2** **Completion marker.** When `welcome_flow_completed_at` is set, the entry shows a **completed** state — a read-only reflection of the same server flag (never a second copy), exactly like the Dashboard card (§4.10).
- **FR‑CO3** **Re-entry / replay.** Selecting the entry routes to `/welcome`, and the member can walk the **whole flow again** even after completing it. Replay is **idempotent**: `mark_welcome_flow_complete()` is set-once (`COALESCE`), so re-walking **never resets the original completion timestamp** and **never re-arms the mandatory gate**. `/welcome` is therefore reachable **voluntarily by completed users** (it is already on the gate allowlist), not only via the gate.
- **FR‑CO4** **Completion stat — live-derived (ADR-0050 / `decisions.md` §2).** The Courses page shows **"N members have completed the Welcome Flow"** (the total who have experienced the whole flow), in the **same stat/component style** as the other course stats. **N is a live count computed in the read path** — `count(*) FROM profiles WHERE welcome_flow_completed_at IS NOT NULL AND NOT is_test_account` via a dedicated `get_*` RPC — **never a stored counter a job increments.** A stored/`+1` counter freezes when its job stops and drifts under two writers — the exact ADR-0050 failure class (`decisions.md` §2 forbids it and the arch gate blocks reading such counters). Because the flag is set-once, the count reflects **distinct users who finished**, so replays never inflate it.

| AC | Criterion |
|---|---|
| AC‑CO1 | The Welcome Flow is the first entry in the Courses first tab, visible to all authenticated roles, in the standard course-card style — **reachable even when the member has completed all Get Started courses** (by which point the Dashboard card may be gone). |
| AC‑CO2 | A member who completed the flow sees the Courses entry marked **complete** (driven by the server flag; verified by toggling it). |
| AC‑CO3 | A completed member can re-enter from Courses and walk the whole flow again; `welcome_flow_completed_at` is **unchanged** afterward (set-once) and they are not re-gated. |
| AC‑CO4 | The "completed Welcome Flow" count is **live-derived** (asserted against DB rows, not a stored counter), excludes test accounts, and does **not** increase on replay. |

---

## 5. System Architecture & Boundaries

*Discipline applied: enterprise-architecture-standards (layered/hexagonal internal organization, the four architecture questions, boundary + ownership + dependency + failure analysis, performance-at-scale). All citations are to `C:\Users\morga\Documents\tfn-onboarding` on `feat/welcome-flow-onboarding`.*

### 1. Architectural style decision (and what we deliberately did NOT do)

The Welcome Flow is a **feature module inside the existing modular monolith** (Vite + React SPA over a Supabase backend). It introduces **no new service boundary, no new edge function, and no new data store.** Per the enterprise-architecture-standards selection framework, the drivers that justify a service split (independent team deploy cadence, per-component scaling divergence, regulatory isolation) are all absent here: one team, one deploy pipeline (Cloudflare Pages), ~767 users. Adding a dedicated "onboarding service" or an orchestration edge function would be architecture-astronautics — a distributed-systems tax with no payer.

What the feature *does* demand is strict **internal** boundaries (hexagonal/layered, applied within the monolith — `software-architecture-styles.md` §"Hexagonal"). The flow touches auth-adjacent routing, profile data, and a third-party marketing system; those are exactly the seams where leaks happen. The layering is non-negotiable:

```
Routed page + step components (UI, presentation only)
        │  reads useAuth().profile, calls hooks
        ▼
Hooks  (useWelcomeGate, useWelcomeFlow, useMarketingSubscription)   ← React Query owns cache
        │  plain data in / out
        ▼
Services (ProfileService = sole profiles writer; marketing via RPC seam)
        │  supabase-js
        ▼
Supabase (Postgres + RLS + RPCs; Email Octopus via existing edge worker, called through invokeEdge)
```

The dependency arrow points **down only**. A step component never imports `@/integrations/supabase/client` (enforced — `src/components/CLAUDE.md`), never calls `supabase.from`, and never holds business rules.

### 2. Where every piece of logic lives (boundary placement)

| Concern | Owner (layer) | Rationale / anti-pattern avoided |
|---|---|---|
| "Has this user finished the flow?" decision | `useWelcomeGate` hook, deriving a boolean from `useAuth().profile.welcome_flow_completed_at` | Not in `main.tsx` boot (frozen; CLAUDE.md), not in a route element. A cross-cutting guard is a **decorator over the `ProtectedRoute` seam** (`src/components/ProtectedRoute.tsx:5`), not imperative boot code. |
| Un-skippable redirect | `WelcomeGate` wrapper composed **inside/after** `ProtectedRoute`, allowlisting `/welcome` + sign-out | Reuses the ~50-route seam once, rather than sprinkling `<Navigate>` into every page (which would drift). |
| Step sequencing (persisted step, next/back) | `useWelcomeFlow` hook + routed full-screen `WelcomePage` | Mirrors the multi-step mechanics of `src/pages/ProjectApplicationPage.tsx`. Step index is **UI state**, not a business fact — it does not belong on `profiles`. |
| Profile writes (completion flag, step-f fields) | **`ProfileService` only** (`src/services/profile.service.ts`) | `profiles` has exactly one writer seam (`decisions.md` §2). A raw `supabase.from('profiles').update()` in a step component is a security + ownership regression. |
| Newsletter opt-in | RPC seam `set_my_marketing_subscription` via a `useMarketingSubscription` hook | Email Octopus is the source of truth (ADR-0017); marketing state is **never mirrored on `profiles`**. |
| Dashboard completion card | `DashboardPage` builds a `ChecklistItem` whose `completed` reads the same server flag | Card is a **read-only reflection** of the server fact, never a second copy. |

Litmus test satisfied ("if another part of the app needed this tomorrow, could it find it?"): completion status is on the profile behind `ProfileService`, and the step-(f) Basic-Information fields are the member's existing profile columns behind the same owner — both reusable by `EditProfilePage` without copy-paste. (No goals column — step (d) removed, P9.)

### 3. The four architecture questions, answered per surface

#### 3a. The mandatory gate

- **Boundary placement** — A route guard, composed at the `ProtectedRoute` seam, **never** in `main.tsx` or the Supabase client bootstrap (auth layer is frozen — CLAUDE.md, `06-auth-flow-lockdown`). The guard is pure routing; the *decision* is a one-line derivation in `useWelcomeGate`.
- **Data ownership** — The gate **reads only** `useAuth().profile.welcome_flow_completed_at`. It writes nothing. The single writer is `ProfileService.markWelcomeFlowComplete`.
- **Dependency direction** — The guard depends on `useAuth()` and `react-router` (a UI concern, correct for a component). It must **not** reach into `supabase.auth` or GoTrue directly — that is the frozen layer's job. It coordinates with, and never duplicates, `AuthRedirectHandler` (`src/components/AuthRedirectHandler.tsx:47`) which lands users on `/dashboard`; the gate must win so a first-timer is not bounced dashboard→welcome→dashboard.
- **Error handling** — This is the lockout-sensitive surface. `AuthContext.fetchProfile` races a 10s timeout and sets `profileLoaded=true` in `finally`, leaving `profile` possibly `null` on failure (`src/contexts/AuthContext.tsx:170`-`184`). The gate's three-state contract, as a **negative-then-positive** rule:

```tsx
// ❌ never — collapses "still loading" and "fetch failed" into a redirect,
//    and treats a null profile as "not completed" → re-loops a user who DID finish,
//    or (the mirror bug) lets an un-onboarded user through on a transient failure.
if (!profile?.welcome_flow_completed_at) return <Navigate to="/welcome" replace />;

// ✅ always — three explicit states; never trap, never silently bypass
if (!profileLoaded) return <FullScreenSpinner label="Loading…" />;      // spinner
if (profileLoaded && profile === null)                                   // fetch failed
  return <WelcomeGateError onRetry={refreshProfile} />;                  // retry, do NOT redirect, do NOT allow
if (!profile.welcome_flow_completed_at && !isAllowlisted(pathname))
  return <Navigate to="/welcome" replace />;                            // enforce
return children;
```

  The retry state uses `refreshProfile()` (already on the context, `AuthContext.tsx:233`). Security ordering: the flow page stays inside `ProtectedRoute` + `AppLayout`, so the global `MfaEnforcementGuard` dialog (`src/components/MfaEnforcementGuard.tsx`) still overlays `/welcome` — AAL2 enforcement is preserved without the gate needing to know about MFA (correct dependency direction: security-first sequencing falls out of composition, not coupling).

#### 3b. Flow steps (a)–(g)

| Step | Boundary | Ownership | Dependency | Failure |
|---|---|---|---|---|
| a,b,c (content) | Presentation only; SVGs via `<img alt>` from `src/assets/` | none (static) | no data layer touched | n/a |
| ~~d (goals toggles)~~ | **REMOVED (P9)** — step (d) is out of scope; no goals column, no toggles, no d1/d2 routing | — | — | — |
| e (newsletter) | `useMarketingSubscription` → RPC | **Email Octopus** owns subscription; default OFF → enqueue only on opt-in | RPC seam, not `profiles` | RPC is fail-open by design; surface a non-blocking warning, never block flow completion |
| f (profile) | `ProfileService.update/updateFields` (allow-list + `deepSanitize`, `profile.service.ts:158`) | existing Basic Information columns | shares the ONE owner + React Query cache with `EditProfilePage` | field validation before write; failure → inline error, no partial commit |
| g (CTAs) | Presentation; `Button asChild` → router `Link` | fixed CTAs only — no selection-driven routing (step (d) removed, P9) | — | n/a |

#### 3c. Dashboard card

- **Boundary** — a `ChecklistItem` inside `DashboardPage` Get Started (`core_courses`), kept OUT of `TrainingPage`.
- **Ownership** — `completed` is derived from the same server flag; **no** localStorage or second flag.
- **Dependency** — reads `useAuth().profile`; no new fetch.
- **Failure** — if profile is unavailable the card renders in its incomplete/loading state (the existing `overviewReady` skeleton path, `DashboardPage.tsx:395`), never crashes the widget.
- **Decision (hideable?)** — **The card lives inside the hideable `core_courses` widget and needs no special non-hideable treatment.** Completion is *already enforced server-side by the gate*; the card is a celebratory reflection, so a user hiding it has zero correctness impact. Forcing it non-hideable would fight `use-dashboard-preferences` ownership (`DashboardPage.tsx:347`, `362`) — an unjustified special case. ✅ normal `ChecklistItem`; ❌ bespoke always-on widget.

### 4. Component / module inventory

**New files**

| Path | Responsibility | Layer |
|---|---|---|
| `src/pages/WelcomePage.tsx` | Routed full-screen host; renders current step; 100dvh + safe-area; mobile-first single column | UI |
| `src/components/welcome/steps/*.tsx` (7) | One presentational component per step (a–g); no data access, no business rules | UI |
| `src/components/WelcomeGate.tsx` | Route guard decorator over `ProtectedRoute`; spinner / retry / enforce / allow | UI (routing) |
| `src/hooks/use-welcome-gate.ts` | Derives the boolean + allowlist from `useAuth().profile`; zero extra round-trips | hook |
| `src/hooks/use-welcome-flow.ts` | Persisted step index, next/back, submit orchestration (calls `ProfileService`) | hook |
| `src/hooks/use-marketing-subscription.ts` | Wraps `get/set_my_marketing_subscription` via the RPC seam | hook |
| ~~`src/lib/welcome-flow-goals.ts`~~ | **REMOVED (P9)** — no goals constant | — |
| `supabase/migrations/<ts>_welcome_flow.sql` | Expand-only: `welcome_flow_completed_at timestamptz NULL` + `mark_welcome_flow_complete()` + `get_welcome_flow_completion_count()` RPCs (no goals column, P9); additive, idempotent | schema |

**Changed files**

| Path | Change | Why |
|---|---|---|
| `src/services/profile.service.ts` | Add both new columns to the explicit `.select()` (`:52`); add `markWelcomeFlowComplete`; extend `ALLOWED_PROFILE_FIELDS` / `update` for goals | single writer; expose flag to `useAuth().profile` |
| `src/App.tsx` | Replace `/welcome` element (currently `WelcomeWizard`, `:251`) with `WelcomePage`; wrap protected routes with `WelcomeGate` (once, at the seam) | retire legacy; mount gate |
| `src/pages/DashboardPage.tsx` | Add Welcome `ChecklistItem` to `core_courses` derivation (`:329`) | completion card |
| `src/pages/EditProfilePage.tsx` | No change for goals (removed, P9); Basic Information already shares the step-(f) columns | bidirectional sync via shared owner (`ProfileService` + one cache) |
| `scripts/ci/arch-gate.config.json` (+ rule) | Ban `@/components/ui` + `lucide-react` under `src/components/welcome/**` | DS-only enforcement |
| `src/pages/WelcomeWizard.tsx`, `WelcomeDialog`, `ProfileSetupDialog` | Retire/suppress per "delete the band-aid it replaces" (CLAUDE.md) | one flow, no overlap |

### 5. Sequence of events

**(i) First-login gate redirect**
```
SIGNED_IN → AuthContext sets user/session, fetchProfile() (AuthContext.tsx:349)
  → ProfileService.fetch returns row incl. welcome_flow_completed_at = NULL
  → profileLoaded=true, profile set
AuthRedirectHandler wants /dashboard; WelcomeGate evaluates first:
  profileLoaded ✔, profile≠null ✔, completed_at=NULL, path≠/welcome
  → <Navigate to="/welcome" replace>  (no extra round-trip — flag already in profile)
```
**(ii) Bidirectional preference edit**
```
User toggles goal d1 in WelcomePage  ──┐
User later edits same goal in EditProfilePage ──┤ both call
  → ProfileService.update/updateFields (single writer)
  → React Query invalidates the profile query key
  → useAuth().profile re-reads; BOTH surfaces reflect the new value
    (one owner + one cache; never "kept in sync")
```
**(iii) Newsletter opt-in**
```
Step-e Switch ON (default OFF) → useMarketingSubscription.set(true, source)
  → RPC set_my_marketing_subscription → EO edge worker enqueues subscribe
  → get_my_marketing_subscription() is the display read
  (fail-open: a worker hiccup warns but does not block step completion)
```

### 6. Performance & scale (~767 users, headroom to 10k)

- **Zero added round-trips on the hot path.** The gate reads `welcome_flow_completed_at` from `useAuth().profile`, which is already fetched once per session (`AuthContext.tsx:498`). The one new `timestamptz` column rides the *existing* explicit `SELECT` (`profile.service.ts:52`) — one column, no new query. ❌ a `useQuery(['welcome-status'])` per route would add a round-trip × 50 routes; ✅ derive from the profile already in memory.
- **No N+1.** The dashboard card and the Courses entry card derive from the in-memory profile; they do not query per render (`coding-principles.md` §complexity). The Courses completion-count stat is **one cached `useQuery` for the whole page** reading a single aggregate RPC (§6.13), never a per-row or per-card query.
- **Gate cost is O(1) per navigation** — a boolean read + allowlist `Set.has`, no async. At 10k users this is unchanged (client-side, per-user).
- **Write volume is a one-shot per user; cutover concurrency is bounded by organic login arrival (flagless — no ramp).** Completion is set once; each existing member writes once on their next sign-in. With no ramp, the concurrency that matters is the **natural daily login peak** (`peak logins/min`), since a 100%-at-merge launch still only converts a user on their *next* login — never a synchronized 767-write burst (the NFR in §3; the capacity decision in §9.7 resolves the former TBD-4). `profiles` is row-scoped RLS (`auth.uid()=user_id`), so each write is an indexed single-row update — confirm it stays within the prod PgBouncer connection limit at the first post-launch daily peak, rather than asserting there is no spike.
- **The completion-count stat read is shared + cached** — one `useQuery(['welcome-completion-count'])` against the aggregate RPC (§6.13), `staleTime` on the order of minutes, one query for the whole Courses page; it adds no per-user fan-out.

### 7. Explicit TBDs (write the requirement around them)

- Step (d) is removed (P9) — no goals option set. The step-f field list maps to the member's **existing** profile columns (First Name, Last Name, Country, Portfolio URL, LinkedIn URL — all already allow-listed in `ProfileService`); the design's "State" has **no existing column and is not collected** (P11 resolved — sync to current fields, add no new column). Step (f) therefore adds **no** column; the only new column in the whole feature is `welcome_flow_completed_at`.
- The step-e **override email** is architecturally out of scope for the existing RPC (no email param; EO + DSAR erasure key off `profiles.email`) — it needs its own owned mapping + ADR and is deliberately *not* wired through `set_my_marketing_subscription`.

---

## 6. Data Model, Ownership & Migrations

Discipline: enterprise-architecture-standards (database architecture, single-owner data model) + compliance-data-lifecycle (safe expand/contract migrations, DSAR/erasure, minimization). Everything below is grounded in the live schema; paths cite `path:line`.

### 1. Scope of schema change — three facts, three owners

| Fact | Owner (single writer) | Storage | Domain | Why here and not elsewhere |
|---|---|---|---|---|
| "This member finished the Welcome Flow" | `mark_welcome_flow_complete()` RPC, wrapped by `ProfileService.markWelcomeFlowComplete` | `profiles.welcome_flow_completed_at timestamptz NULL` | profile | Distinct from `onboarded_at`, which the legacy skippable wizard sets and `v_profile_readiness` + admin read — see §2 |
| ~~"What the member wants to do here" (step d)~~ — **REMOVED (P9, §4.6)** | — | — | — | Step (d) is out of scope: **no `welcome_flow_goals` column, no `updateWelcomeGoals`, no option-key constant, no conditional CTAs.** |
| "Where marketing email is sent, if overridden" (step e) | EO-domain RPC (NOT ProfileService) | new `public.marketing_contact_email` table | marketing/EO | ADR-0017 forbids marketing state on `profiles`; `profiles.email` is immutable — see §6 |

The completion flag is a single additive column on an existing row-scoped table and ships in PR1. The override marketing email is a new owned table with its own DSAR path and warrants its own ADR + PR (ADR 20261009-welcome-flow-eo-extension); do not couple it to PR1. *(Step (f) adds no column — it syncs to existing columns; no `state` column, P11.)*

### 2. `welcome_flow_completed_at` — do not overload `onboarded_at`

`onboarded_at` is already taken and load-bearing:

```
-- supabase/migrations/20260602230831_...sql:5-9
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ, ...
COMMENT ON COLUMN public.profiles.onboarded_at IS
  'Set once when the member completes the /welcome wizard. NULL = gate the wizard.';
-- and it is a projected column of the readiness view:
-- supabase/migrations/20260602233140_...sql:66   p.onboarded_at,
```

```sql
-- ❌ never — overloading onboarded_at silently changes v_profile_readiness + admin pages,
--            and collides with the legacy WelcomeWizard that still writes it
UPDATE public.profiles SET onboarded_at = now() WHERE user_id = auth.uid();

-- ✅ always — a new, purpose-built flag with exactly one owner and set-once semantics
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS welcome_flow_completed_at timestamptz;
```

`NULL` for every existing row = all ~767 members get the flow exactly once on next sign-in. **No backfill-as-complete** — a backfill would suppress the flow for the exact cohort the feature targets.

### 3. ~~Step-d goals column~~ — REMOVED (P9)

**Step (d) and its `welcome_flow_goals` column are out of scope** — product removed step (d) (§4.6). The earlier analysis (a `text[]` of stable keys vs. a Postgres `enum` vs. a value-listing `CHECK`, the shape-only DB bound, and the canonical option-key constant) lives in git history only and is **not built**. If a goals/preferences capture is ever reintroduced, it returns as a new feature with its own ADR and data-model section. The sole remaining new profile column is `welcome_flow_completed_at` (§2) — plus the possible `state` column (step f, P11).

### 4. Single-owner, "bidirectional sync" = ONE copy, never two kept in sync

The PDF's "do not build them separately" is a **one-owner-per-fact** rule. With step (d) removed, this now governs the **step-(f) profile fields** (First Name, Last Name, Country, State, Portfolio URL, LinkedIn URL): the Welcome-Flow step-(f) screen and the EditProfilePage "Basic Information" section are two *views* of the same `profiles` columns, both written through the one owner (`ProfileService`) and read from the one React-Query cache — nothing to "sync."

The concrete anti-pattern already in the tree (a component writing `profiles` directly, bypassing the owner and sanitization) must not be repeated:

```ts
// ❌ never — a component writing profiles outside ProfileService / the allow-list + deepSanitize
//            (QuestIntakeWizard.tsx:106-109 does this; src/components/CLAUDE.md forbids it)
await supabase.from("profiles").update({ first_name: value }).eq("user_id", user.id);

// ❌ never — a second copy + a useEffect "mirror" between the flow and the profile page.
//            Two copies always disagree eventually (global CLAUDE.md, data ownership).
useEffect(() => { setProfileForm(flowForm); }, [flowForm]);
```

```ts
// ✅ always — both surfaces call the SAME owner; both read the SAME cache; nothing to "sync"
await profileService.updateFields(userId, { first_name, last_name, country, portfolio_url, linkedin_url });
// then invalidate the profile query key; useAuth().profile is the one source both render from.
```

Both the Welcome-Flow step (f) and EditProfilePage "Basic Information" call `ProfileService.updateFields` (allow-list + `deepSanitize`), then invalidate the profile query. Editing either surface updates the same columns → the other reflects it on next read. That IS the bidirectional sync. (See §4.8 FR‑f5 for the redundant-entry pre-fill.)

### 5. Completion flag = set-once at the owning layer (RPC)

`markWelcomeFlowComplete` must be idempotent and set-once (never move the original timestamp, never depend on the client clock). PostgREST cannot express `COALESCE(col, now())` in one update, so the invariant is proven at the DB (ADR-0024), self-scoped to the caller (defense in depth — a member can only complete their *own* flow):

```sql
CREATE OR REPLACE FUNCTION public.mark_welcome_flow_complete()
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_ts timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING errcode = '28000'; END IF;
  UPDATE public.profiles
     SET welcome_flow_completed_at = COALESCE(welcome_flow_completed_at, now())  -- set-once
   WHERE user_id = v_uid
   RETURNING welcome_flow_completed_at INTO v_ts;
  RETURN v_ts;
END; $$;
REVOKE ALL ON FUNCTION public.mark_welcome_flow_complete() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_welcome_flow_complete() TO authenticated;
```

*Set-once is concurrency-safe at the isolation level:* `COALESCE(welcome_flow_completed_at, now())` under Postgres Read Committed takes a row lock, so a second concurrent call (double-submit, retry) re-reads the now-non-null value and keeps the **original** timestamp — complete-once holds without any client-side coordination.

```ts
// src/services/profile.service.ts — the single code-path; RPC is the single data-path.
// BOUNDED WRITE (lockout-critical). ProfileService uses DIRECT supabase-js — retryPostgrest +
// withAuthLockRetry (profile.service.ts:44-52) — NOT invokeEdge, so invokeEdge's 8s AbortController
// does NOT apply here. The finish-CTA completion write is the most lockout-sensitive write in the app:
// if it HANGS (PgBouncer saturation during the ~767-member cutover, slow-3G) a naive `await` spins
// forever on the final step = an S1 wrongful-lockout. Wrap it in the repo's existing bounded-write
// helper so a hang becomes a bounded, retriable error state instead of an infinite spinner.
import { withBoundedSave } from "@/lib/data/bounded-save";   // already used by ProjectFormPage.tsx
async markWelcomeFlowComplete(): Promise<void> {
  await withBoundedSave({
    timeoutMs: 15_000,
    save:  () => retryPostgrest(() => withAuthLockRetry(() => supabase.rpc("mark_welcome_flow_complete"))),
    probe: () => this.fetch(),   // on timeout, reconcile against server truth — set-once makes this safe
  });
}
// The step-f ProfileService.update (Basic Information) MUST use the SAME retryPostgrest +
// withAuthLockRetry wrappers every other ProfileService call uses (never a bare supabase.from().update).
```

**`fetch()` select change** (`profile.service.ts:52`) — append `welcome_flow_completed_at` to the explicit column list, and add it to the `Profile` interface (`profile.service.ts:10-39`):

```ts
// interface Profile { ... }
welcome_flow_completed_at: string | null;
```

**`updateFields` allow-list (`profile.service.ts:160-179`): NO change needed.** Step-f Basic-Information fields are **already** allow-listed existing columns (`first_name`, `last_name`, `country`, `portfolio_url`, `linkedin_url`). **`state` is NOT collected (P11 resolved — sync to current fields, add no column);** the design shows no `timezone`/`scheduling_url`. `welcome_flow_completed_at` is write-once via the RPC and must **never** be in the generic allow-list (a component could otherwise clobber it).

### 6. ~~Canonical option-key contract + d1/d2 → CTA map~~ — REMOVED (P9)

With step (d) removed, there is **no `src/lib/welcome-flow-goals.ts` constant, no `WELCOME_GOAL_OPTIONS` / `WELCOME_GOAL_KEYS`, and no d1/d2 → CTA map.** Step (g) renders only its fixed CTAs (§4.9 FR‑g1); there is no selection-driven routing.

### 7. Expand/contract plan (auto-apply on merge — ADR-0045)

A `db push` lands on prod while old app code may still be running and is not atomic with the Cloudflare Pages / edge deploy (`supabase/migrations/CLAUDE.md`). Every step below is invisible to old code (new nullable column, new column with constant default, new function) so there is **no half-applied state old code can observe**.

| Order | Change | Kind | Safe because |
|---|---|---|---|
| 1 | PR1 migration applies (columns + RPC) | expand | old code never selects them; defaults backfill instantly |
| 2 | Flow code ships (steps a–g behind the un-gated `/welcome` route) | — | reachable only by those who navigate there; reads tolerate `null` = "not completed" |
| 3 | Gate code ships (LAST) → flow is live 100% at merge | — | flagless (§11.2); rollback = frontend revert (minutes), no schema change |
| — | `onboarded_at` drop | **not done** | still read by `v_profile_readiness` + admin; retiring the *legacy wizard code* (brief §7) is a code change, not a contract migration |

No contract migration exists in this feature. Reads must tolerate `welcome_flow_completed_at IS NULL`.

**Two-merge expand-first split (mandatory — the migration ships ALONE).** `deploy-migrations.yml` and `deploy-frontend.yml` both fire on merge to `main` with no ordering (§11.3), so a bundle that `SELECT`s a not-yet-applied column 400s the profile fetch and trips the gate's error path for *every* user. Therefore **PR1 ships only the migration** (the column + RPC + flag seed). The change that adds `welcome_flow_completed_at` to `ProfileService.fetch()`'s explicit select (`profile.service.ts:52`) ships in a **separate, later merge (PR2)**, only after `db-schema-gate` is green on `main` and `supabase db push --dry-run` reports "no pending." The PR1 row in the table above ("columns + RPC") must **not** include the select change.

**Migration file skeletons**

```
supabase/migrations/20260930120000_welcome_flow_completion.sql   (PR1 — expand only)
```
```sql
-- One concern: the Welcome Flow completion flag. Additive, idempotent, no backfill-as-complete.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS welcome_flow_completed_at timestamptz;   -- NULL = show the flow once
COMMENT ON COLUMN public.profiles.welcome_flow_completed_at IS
  'Set once by mark_welcome_flow_complete() when the member finishes the Welcome Flow. NULL = gate the flow. Distinct from onboarded_at (legacy wizard + v_profile_readiness).';
-- (Step-d goals column REMOVED — P9. No `state` column — P11: step (f) syncs to EXISTING columns only.)
-- CREATE OR REPLACE FUNCTION public.mark_welcome_flow_complete() ...  (see §5, self-scoped, set-once)
-- CREATE OR REPLACE FUNCTION public.get_welcome_flow_completion_count() ...  (see §6.13, live-derived, STABLE)
-- REVOKE/GRANT per §5.
-- profiles is ROW-scoped RLS (auth.uid() = user_id) — new column inherits it; NO per-column GRANT (unlike projects/ADR-0056).
```
```
supabase/migrations/20261002120000_marketing_contact_email_override.sql    (PR-N — second ADR, §6)
```
```sql
-- Marketing-email override lives in the EO/marketing domain, NOT on profiles (ADR-0017).
-- profiles.email is immutable (prevent_email_change_trigger, 20260412212702) and everything keys off it,
-- so the override is a NEW owned fact with its OWN read path, OWN validation, OWN DSAR erasure.
CREATE TABLE IF NOT EXISTS public.marketing_contact_email (
  user_id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  marketing_email text NOT NULL CHECK (position('@' in marketing_email) > 1),  -- server-side validation
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.marketing_contact_email FROM anon, authenticated;        -- deny-all; reached only via self-scoped RPCs
ALTER TABLE public.marketing_contact_email ENABLE ROW LEVEL SECURITY;
-- + set/get RPCs (self-scoped via auth.uid());
-- + ERASURE (canonical — see §8.3): the EO-delete enqueue for the override address goes INSIDE the winning
--   handle_user_deletion() (currently 20260911120000_erasure_completeness_reconcile.sql:23, edited via a new
--   CREATE OR REPLACE migration), NOT a standalone BEFORE-DELETE trigger. The ADR-0039 guard
--   (check-erasure-completeness.mjs) scans ONLY handle_user_deletion()'s body, so an enqueue placed anywhere
--   else passes CI UNGUARDED and a future refactor can silently drop it (re-opening the orphan gap). Add
--   'marketing_contact_email' to that guard's REQUIRED list. ON DELETE CASCADE alone is INSUFFICIENT — it
--   erases the DB row but never propagates the deletion to the EO subprocessor.
-- + set_my_marketing_subscription / get_my_marketing_subscription / eo-contact-status must resolve the override
--   BEFORE falling back to profiles.email  → detailed in ADR 20261009-welcome-flow-eo-extension (cross-domain EO change).
```

### 8. Compliance & data lifecycle (GDPR/CCPA)

- **Classification.** `welcome_flow_completed_at` = low-sensitivity operational timestamp; override marketing email = personal contact data. (Step-d goals removed — no profiling signal is collected.)
- **Minimization.** Store stable keys only (not free text, not labels). One boolean-ish timestamp for completion.
- **Erasure (right to be forgotten).** The two `profiles` columns require **no new erasure path** — they are erased with the profile row via the existing account-deletion cascade (`trg_cascade_delete_auth_on_profile`, `20260505182024`). The override table gets `ON DELETE CASCADE` on `user_id` **and** must enqueue an EO delete for the *override* email **from inside the winning `handle_user_deletion()`** (currently `supabase/migrations/20260911120000_erasure_completeness_reconcile.sql:23`, edited via a new `CREATE OR REPLACE` migration) — **not** a standalone `BEFORE DELETE` trigger. Rationale: the ADR-0039 guard (`check-erasure-completeness.mjs`) inspects only `handle_user_deletion()`'s body, so an enqueue placed anywhere else passes CI *unguarded* and a future refactor can silently drop it, re-opening the exact orphan gap. `ON DELETE CASCADE` alone is insufficient (it erases the row but never tells EO), and `marketing_contact_email` MUST be added to that guard's `REQUIRED` list. This is the single strongest reason the override needs its own ADR (`20261009-welcome-flow-eo-extension`); the canonical four-part cascade is specified once in §8.3.
- **DSAR export.** Add `welcome_flow_completed_at` to the personal-data export set; add the override email once it exists.
- **Consent.** Newsletter consent stays owned by EO (`set_my_marketing_subscription`, ADR-0017) — this feature adds no competing consent store. Step-d goals are routing preferences, not marketing consent.
- **Audit logging.** `trg_audit_profiles_privileged` audits only `email,membership_tier,membership_sku,discord_user_id,is_founding_member` (`20260505013104:87`); the new `welcome_flow_completed_at` column is intentionally *not* audited (operational, low sensitivity) — a conscious decision, not an oversight. The surfaced step-(f) fields `portfolio_url,linkedin_url` **are** added to `audit_profile_changes` (§8.4 / P6). The override-email ADR **should** add audit logging of override changes (it redirects where marketing mail goes).

### 9. RLS confirmation

`profiles` is **row-scoped**, not column-scoped:

```
-- supabase/migrations/20260315192853_...sql:58-66  (TO authenticated)
ON public.profiles FOR SELECT/UPDATE/INSERT USING/ WITH CHECK (auth.uid() = user_id);
-- REVOKE ALL ... FROM anon (20260322030225:102)
```

New columns are automatically owner-readable/writable under the existing row policy; **no `GRANT SELECT (col)` is needed** (the projects/ADR-0056 column-grant rule does not apply to `profiles`). The `mark_welcome_flow_complete` RPC is `SECURITY DEFINER` + self-scoped via `auth.uid()`; the override table is deny-all + self-scoped RPCs, mirroring `email_octopus_contact_sync`.

### 10. pgTAP coverage + rollback

New pgTAP suite `supabase/tests/welcome_flow_completion_test.sql` (runs in `db-test`; pattern per existing `supabase/tests/*_test.sql`) must prove:

- [ ] `mark_welcome_flow_complete()` sets the timestamp when null and is **set-once** (a second call returns the original value, does not move it).
- [ ] It is self-scoped: caller A cannot complete caller B's flow (asserts on `auth.uid()` isolation).
- [ ] Row-scoped RLS holds for the new `welcome_flow_completed_at` column (member reads/writes own row only; anon denied); the `get_welcome_flow_completion_count()` RPC returns only a scalar (no row leak).
- [ ] *(Step-d goals pgTAP removed — no goals column, P9.)*
- [ ] (override PR) override table deny-all to `authenticated`, self-scoped RPC, and account deletion erases the row **and** enqueues the EO delete for the override email.
- [ ] (override PR) the **modified `handle_user_deletion()` still erases the EXISTING account-email sinks** after the override line is added — a hardening edit to a destructive `SECURITY DEFINER` function must prove it did not break deletion for everyone (a regression assertion, not only the new override path).

**Rollback story.** Forward-only schema (no down migrations). Flagless (§11.2): the rollback is a **frontend revert** (previous bundle / revert commit → rebuild, minutes); the additive column + RPC remain and are harmless. No schema rollback is ever required — which is what makes the migration safe to auto-apply ahead of code.

### 11. Indexing decision

The feature introduces queries that filter on `welcome_flow_completed_at`: the completion-rate metric (§2) and any cutover/cohort monitoring ("members still NULL"). **State the decision rather than leaving it silent.** At 767–10k rows a sequential scan on this predicate is sub-millisecond, so the default is **no index**. If an admin/SRE view ever lists the *un-onboarded* cohort, add a partial index that shrinks toward zero as members complete:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_welcome_incomplete
  ON public.profiles (user_id) WHERE welcome_flow_completed_at IS NULL;
```

(The removed step-d goals column needed no index regardless — P9.)

### 12. Backup, DR & RTO/RPO; one-time-write safety

- **No new backup/DR surface.** The one new column (`welcome_flow_completed_at`) and the later override table (PR6) live on the **existing** `profiles` Postgres instance; their RTO/RPO are **inherited** from that instance's backup regime — no bespoke backup, retention, or restore job is introduced.
- **PITR as a release gate.** Confirm Supabase **point-in-time recovery is enabled** on the prod project (record it in the §9.7 PRR checkbox). Because the migration is additive and forward-only, **no pre-migration snapshot is required**, and the RPO for `welcome_flow_completed_at` is non-critical per the §9.0 harm analysis (its loss merely re-shows the flow once). Rollback is a frontend revert, not a schema revert (§11.2).
- **One-time-write safety.** The column add is a PG11+ constant-default operation → **metadata-only, no table rewrite, no long lock** on the ~767-row `profiles` table. There is **no row-writing backfill** — completion is set lazily on first login, so release introduces **no mass write event**; the only concurrency is the per-login completion write, bounded by organic login arrival (flagless — no ramp; §3 NFR / §5.6).
- **Migration integrity self-check.** The migration's smoke / pgTAP proves the column exists with the intended default and `SELECT count(*) FROM profiles` is unchanged post-apply (change-management evidence; no rows rewritten).

### 13. Live completion-count stat read RPC (Courses, §4.11)

The Courses page shows "**N members have completed the Welcome Flow**" in the same card style as the course stats. Per **ADR-0050 / `decisions.md` §2 (live-derived stats, never a stored counter)**, this is a **read-only aggregate**, never an incremented column:

```sql
-- ✅ live-derived: count at read time; no stored/incremented counter to drift (ADR-0050).
-- SECURITY DEFINER so it can count across rows that row-scoped RLS would otherwise hide,
-- while exposing only a single scalar (no row data leaks). STABLE, no args.
CREATE OR REPLACE FUNCTION public.get_welcome_flow_completion_count()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int
  FROM public.profiles
  WHERE welcome_flow_completed_at IS NOT NULL
    AND coalesce(is_test_account, false) = false;   -- exclude test accounts, mirroring get_network_stats
$$;
REVOKE ALL ON FUNCTION public.get_welcome_flow_completion_count() FROM public;
GRANT EXECUTE ON FUNCTION public.get_welcome_flow_completion_count() TO authenticated;
```

```ts
// ❌ never — a stored counter the flow increments on completion (ADR-0050 two-writer drift class)
await supabase.from('welcome_flow_stats').update({ total: total + 1 });

// ✅ always — one cached read of the live aggregate; the stat is a projection, not a fact to own
const { data } = useQuery(['welcome-completion-count'],
  () => supabase.rpc('get_welcome_flow_completion_count'), { staleTime: 5 * 60_000 });
```

- **Owner:** the RPC is the single read seam; the Courses card reads it via one cached `useQuery` (§6-perf). No component calls `supabase.from('profiles').select('count')` directly (arch-gate DS/data-access rule).
- **Test-account exclusion** mirrors the existing `get_network_stats` convention so the public number is honest (`is_test_account` column; confirm its name at build — if absent, drop the predicate and note it).
- **Enforced by** the `live-stat-not-counter` test (§10) and a §11.8 `@release-safety` scenario: no `welcome_flow_stats`/counter table may exist; the number must equal `count(*)` over `profiles`.

---

## 7. Security & Threat Model

Threat-modeled against the OWASP Cheat Sheet Series with a mandatory lockout/availability pass first (Step 0 of `owasp-secure-coding-bdd`). The Welcome Flow adds a **mandatory, un-skippable route gate over ~50 routes for ~767 production users**, a **new owned completion flag** (one column — no goals column, P9), a **profile-write surface**, a **live completion-count read RPC** (§6.13), and a **marketing-email override** that reaches Email Octopus. The single highest risk is not a data breach — it is **locking every user out of the entire app** with a gate that redirects to a page that itself depends on a flaky profile read. That risk drives this section.

### Attack surface (Step 1)

| Surface | Where | OWASP focus |
|---|---|---|
| Mandatory redirect gate (availability) | new `useWelcomeGate` + `ProtectedRoute` (`src/components/ProtectedRoute.tsx:5`) | Lockout-prevention, A05 misconfig |
| Completion flag write | new `ProfileService.markWelcomeFlowComplete` | A01 access control, A04 mass assignment |
| ~~Goals column (step d)~~ — REMOVED (P9) | — | — |
| Profile fields (step f) | `ProfileService.update/updateFields` (`src/services/profile.service.ts:76,158`) | A03, A04 |
| Newsletter opt-in + override email (step e) | `set_my_marketing_subscription` RPC + new email mapping | A01, consent integrity, injection, enumeration |
| Secrets | `FIGMA_TOKEN` (build-time), EO keys (edge-only) | A02/A05 secrets exposure |

---

### 1. Gate lockout matrix (Step 0 — mandatory, blocking)

A mandatory redirect that can trap 767 users is the top risk. The governing fact is in `AuthContext.fetchProfile` (`src/contexts/AuthContext.tsx:170-183`): it **races `ProfileService.fetch` against a 10s timeout that resolves `null`, returns `null` on error, and always sets `profileLoaded=true` in `finally`, only calling `setProfile(data)` when `data` is truthy.** So "flag is absent" and "we never successfully read the profile" are **indistinguishable** from `profile.welcome_flow_completed_at` alone. The gate **must not** treat unknown as not-completed, or a single flaked read re-traps a user who already finished.

Decision rule the gate encodes: **`welcome_flow_completed_at === null` on a *successfully loaded* profile → show the flow (fail-closed to onboarding). Unknown because the profile read failed/timed out → render the app with a non-blocking retry (fail-open to availability).** There is **no feature flag** (flagless launch, §11.2), so there is no flag-read state to resolve — the gate arms purely on authentication + a successfully-read null completion fact. Onboarding is UX, not a security control; a user who slips through on a flaked read still gets the flow on the next clean load and **cannot forge server-side completion**, so the bounded, self-healing bypass is strictly preferable to locking everyone out.

| # | Failure | ❌ Naive behavior | ✅ Fail-safe behavior |
|---|---|---|---|
| L1 | Profile fetch fails / times out (10s null, `AuthContext.tsx:170-183`) | Gate sees no flag → redirect to `/welcome` → `/welcome` can't read profile → **loop** | Treat as **unknown**: render app + retry affordance that re-fetches; gate flips to showing the flow only once a *successful* read returns null |
| L2 | `profileLoaded === false` | Redirect while still loading → flicker/bounce | Render the existing spinner (mirror `ProtectedRoute.tsx:24-32`); **never redirect on `loading`/`!profileLoaded`** |
| L3 | *(was: feature-flag read fails)* — **N/A, flagless (§11.2).** There is no flag in the gate path, so no flag outage can enable or disable the gate | A flag-service outage silently flips the gate | **No feature flag exists.** The gate arms on a successfully-read `welcome_flow_completed_at IS NULL`; the only "outage" that matters is a failed profile read (L1), handled by the unknown→retry state |
| L4 | Completion write fails after step g | CTA navigates anyway → gate bounces back to `/welcome` → loop | Await + error-check the write **before** navigating; on failure show retry + support path; never navigate on an unconfirmed write |
| L5 | Redirect loop / allowlist gap | `/welcome` itself is gated, or sign-out is gated → inescapable | Allowlist `/welcome` **and every sign-out path**; `AuthRedirectHandler` stored-redirect nav (`src/components/AuthRedirectHandler.tsx:47-60`) must yield to the gate while incomplete |
| L6 | Admins locked out / app-wide breakage | A bug in `/welcome` locks all 767 incl. admins out of the whole app | **Flagless (§11.2): recovery is a frontend bundle revert (minutes), not a flag flip.** This is the accepted residual risk; the compensating controls (lockout-safety `@reliability` merge-blocker, fail-safe three-state gate, gate PR merges last, named launch owner + fast-revert runbook) are mandatory — §11.2. Break-glass `resetWelcomeFlow` un-completes a single bad-state user |
| L7 | Gate races MFA | Welcome gate runs before AAL2 → AAL1 user reaches onboarding writes | Sequence **after `MfaEnforcementGuard`** (`src/components/MfaEnforcementGuard.tsx`); security gate wins, onboarding gate second |

**Do not copy the MFA gate's fail-open `catch` (`MfaEnforcementGuard.tsx:68-70`) as a *bypass*.** There, fail-open is safe because a separate hard channel (the challenge dialog + `signOutSafe`) still enforces AAL2. The welcome gate has no such backstop, so its fail-open is scoped precisely: fail-open **to the app on unknown state**, fail-closed **to the flow on a confirmed-null flag**.

```ts
// ❌ never — collapses "not completed" and "read failed" into one redirect (L1 lockout)
if (!profile?.welcome_flow_completed_at) return <Navigate to="/welcome" replace />;

// ✅ always — three explicit states; unknown fails OPEN, confirmed-null fails to the flow.
// Flagless (§11.2): no flag branch — the gate arms purely on the completion fact.
if (loading || !profileLoaded) return <Spinner/>;         // L2
if (profileReadFailed) return <>{children}<RetryBanner/></>; // L1 unknown → app + self-healing retry
if (profile.welcome_flow_completed_at == null) return <Navigate to="/welcome" replace />; // known-null
return children;
```

---

### 2. A01 Broken Access Control + RLS

`profiles` is **row-scoped** RLS: `FOR SELECT/UPDATE/INSERT USING (auth.uid() = user_id)` (`supabase/migrations/20260315184805_*.sql:35,38,41`), with an admin read-all policy (`20260317212547_*.sql:99`, read-only). So a user reads and writes only their own flag and goals; admins can read but the flag write is still self-scoped.

**The completion write must be un-forgeable for another user.** RLS is the backstop, but the write must not even *accept* a client `user_id`.

```ts
// ❌ never — trusts a client-supplied id; relies on RLS alone and invites IDOR-by-habit
markWelcomeFlowComplete(userId: string) {
  return supabase.from("profiles").update({ welcome_flow_completed_at: new Date().toISOString() })
    .eq("user_id", userId); // userId came from the request body
}

// ✅ always — derive the id from the session; RLS WITH CHECK(auth.uid()=user_id) is the structural backstop.
//    Stronger (matches the EO precedent): a no-arg SECURITY DEFINER RPC keyed on auth.uid() so no user_id
//    parameter exists to forge at all.
markWelcomeFlowComplete() { return supabase.rpc("mark_welcome_flow_complete"); }
```

The RPC form (mirroring `set_my_marketing_subscription`, which takes no email param and pins to `auth.uid()`, `20260822120000_email_octopus_sync.sql:70-91`) makes cross-user forgery **structurally impossible**, and should be idempotent: set the timestamp only when currently null, so replay/double-submit is a no-op and complete-once holds. The gate reads the flag via `useAuth().profile`, sourced from `ProfileService.fetch` scoped to the caller (`profile.service.ts:52-53`) — no cross-user read path.

---

### 3. A03 Injection + A04 Mass Assignment

The step-f profile fields are member-controlled and must not become a mass-assignment or stored-XSS vector. The service already enforces an allow-list + `deepSanitize` (`profile.service.ts:160-182`, which also has prototype-pollution and recursion-depth guards, `src/lib/security.ts:117,134`). The requirement:

**Validate step-f input, don't just sanitize.** `deepSanitize` strips HTML but happily stores arbitrary strings; validate each field (type, length, URL shape) and persist only allow-listed keys via the owner.

```ts
// ❌ never — write whatever the client sent (over-posting: a forged is_admin / other column could ride along)
updateFields(userId, body);

// ✅ always — zod-validate the known step-f fields, THEN persist via ProfileService (the allow-list drops the rest)
const fields = profileStepFSchema.parse(body);   // first_name, last_name, country, portfolio_url, linkedin_url (+ state if P11)
await profileService.updateFields(userId, fields);
```

**Every new step-f field must be added to BOTH the zod schema (`src/lib/validators/profile.ts:33`) and the allow-list.** `updateFields` silently drops unknown keys (`profile.service.ts:180,188-190`) — good for mass-assignment safety, but a forgotten allow-list entry = silent data loss, so treat the allow-list as the audited contract. Writes stay inside `ProfileService`; a raw `supabase.from('profiles').update(...)` in a component is an arch-gate violation (`src/components/CLAUDE.md`) and is exactly the anti-pattern the legacy `WelcomeWizard` carries and this flow retires.

---

### 4. Override-email (step e) — the highest-abuse input

Today `set_my_marketing_subscription` has **no email parameter**; it reads the caller's own email from `profiles` via `auth.uid()` (`20260822120000:70-95`), and `get_my_marketing_subscription`, `eo-contact-status`, and the DSAR erasure cascade all key off `profiles.email` / `auth.users.email`. An override email is a genuinely new owned fact and a new EO subscribe path, so it carries new abuse cases:

- **Consent integrity (the make-or-break abuse case).** Without ownership proof, an attacker sets the override to `victim@example.com`, opts in, and subscribes a stranger to marketing mail they never consented to — a GDPR-consent / CAN-SPAM violation and a spam-relay. **The override email MUST be verified (double opt-in: send a confirmation link to the override address; only enqueue the EO subscribe after the link is clicked).** Never subscribe an unverified, non-account email.
- **Injection into the EO API.** The email string is later placed in an EO API request. Validate server-side and reject CR/LF and control characters to prevent header/payload injection into that outbound call.
- **Validation client AND server.** Client validation is UX only. Enforce RFC-shaped syntax server-side (`z.string().email()` — the same primitive already used at `src/lib/validators/auth.ts:129`) plus a length cap; optional MX/domain check is DNS (not HTTP fetch), so SSRF risk is low, but rate-limit it and never fetch a user-supplied URL.
- **Anti-SSRF / secrets.** The EO worker and keys stay server-only (`EMAILOCTOPUS_API_KEY`/`LIST_ID`, `20260822120000:16-18`); the override never causes the client to hold a key or make the outbound call.
- **No enumeration oracle.** The override flow must not reveal whether an address is already an EO contact or an existing platform user. Return the same "check your inbox to confirm" response regardless — no "already subscribed" / "unknown email" distinction.
- **DSAR erasure gap (must-fix).** `handle_user_deletion()` erases the EO sink only where `lower(email) = lower(OLD.email)` (`supabase/migrations/20260810130001_h9_complete_erasure_cascade.sql:56`) — i.e. the *account* email. A **different** override email would **orphan personal data** on account deletion. The override mapping needs its own erasure line in the cascade.

Because this changes EO ownership and the erasure cascade, it **warrants its own ADR** (per the brief). If verification + erasure aren't ready, ship step-e with **signup-email-only (field prefilled, no override)** and defer the override behind its ADR rather than shipping an unverified subscribe-arbitrary-email path.

---

### 5. Rate limiting, anti-automation, security logging & secrets

- **Newsletter / override confirmation = an abuse amplifier (email bomb / spam relay).** A per-user limit alone does not stop many accounts blasting one victim. Rate-limit the override double-opt-in confirmation send on **three** axes: per-authenticated-user, **per-target-address** (cap confirmations to any single address across all accounts), and a **global hourly ceiling**; and require a **Turnstile** token (the repo's existing CAPTCHA, already used in auth and seeded in `playwright.config.ts`) **before** any confirmation email is sent — the doc previously cited Turnstile only as an e2e flake to dodge, not as the control it is. `set_my_marketing_subscription` is self-only and collapses toggle-storms to the latest version (`20260822120000:99-117`), so DB amplification is bounded; the completion RPC is idempotent, bounding its replay value.
- **Profile-write throttle (the brief asked for it).** Step-f Basic-Information writes are self-scoped (RLS `auth.uid()=user_id`) so blast radius is one row, but are otherwise unbounded. **Debounce autosave** (reuse `useAutosave`, §12.7) and add a **per-user write-rate guard** on `updateFields` so a scripted client cannot storm `profiles`.
- **Security logging of rejected / abusive input (rejections are security events, not silent drops).** A malformed / CR-LF override email and an **RLS-blocked cross-user completion attempt** MUST be reported via `reportValidationRejection` (`decisions.md` §4 — present in the repo, unused by this feature today) into the audit / `ops_events` sink: **user id + event kind** (plus source IP where the edge layer sees it), **never the rejected value itself** (it may be PII). A rejected injection payload that leaves zero durable signal is a monitoring blind spot.
- **`FIGMA_TOKEN`.** Used only at build/design-ingest time to pull assets; it must be a CI/local secret — **never `VITE_`-prefixed** (that would inline it into the client bundle) and never committed. (It is currently unavailable — see §15.2.)

```
// ❌ never — any VITE_-prefixed var is shipped in the browser bundle
VITE_FIGMA_TOKEN=figd_xxx
// ✅ always — build/CI-only; assets are committed static files, the token never reaches the client
FIGMA_TOKEN=figd_xxx   # .env.local / CI secret only, git-ignored
```

---

### 6. @security Gherkin scenarios (and how they actually block CI)

> **Enforcement — be precise (corrected in the re-audit).** `bdd-gate.yml` does **not** execute Gherkin or verify any `@security` behaviour — it only greps that each changed `src/pages`/`src/services`/`supabase/functions` module is *referenced by path* in some test, and the phase-1 `bdd-scenario-runner.mjs` is reporting-only (never fails CI). Each scenario below is therefore enforced by being **realized as an executing test that blocks merge**: system-level `@security`/`@lockout-prevention` as **Playwright** specs in the e2e job; gate-decision / allow-list / validator scenarios as **Vitest** in `gate-test`; DB-scoping scenarios as **pgTAP** in `db-test`. **Additionally**, every OWASP sheet this feature newly enforces (Access Control, Mass Assignment, Email Validation & Verification, Bot Management & Anti-Automation, Logging, Unvalidated Redirects, User Privacy) MUST have its row in `docs/security/owasp-coverage.md` updated to cite the new control — otherwise the **blocking** `check-owasp-coverage.mjs` gate (`ci.yml:323`) still maps those sheets only to pre-existing mechanisms and this feature's controls go unenforced. (This is a §17 Definition-of-Done item.)

```gherkin
@security
Scenario: The welcome gate cannot be skipped by deep-linking
  Given an authenticated user whose welcome_flow_completed_at is null
  And the gate bundle is live (flagless — §11.2)
  When they request "/dashboard" or any gated route directly
  Then they are redirected to "/welcome"
  And no gated page content is rendered

@security
Scenario Outline: Completion persists once across sessions and devices
  Given a user completed the welcome flow on device A
  When they sign in fresh on "<context>"
  Then welcome_flow_completed_at is read from the server profile
  And they are NOT redirected to "/welcome"
  And the flow is never shown again
  Examples: | context |
            | device B |
            | a new browser session |
            | after clearing localStorage |

@security @lockout-prevention
Scenario: A failed profile read does not re-trap a completed user
  Given a user who already completed the welcome flow
  When ProfileService.fetch fails or times out (profile is null, profileLoaded true)
  Then the gate treats the flag as UNKNOWN, not "not completed"
  And the app renders with a retry affordance
  And the user is NOT redirected into the mandatory flow

@security @lockout-prevention
Scenario: A feature-flag read failure cannot lock users out
  Given the feature-flag service is unavailable
  When the welcome gate evaluates
  Then the flag resolves to OFF (safe default)
  And the mandatory gate is disabled
  And all users retain access to the app

@security @lockout-prevention
Scenario: A failed completion write does not create a redirect loop
  Given a user on the final step whose mark-complete write fails
  When they trigger the finish CTA
  Then navigation does not occur
  And a retry with a support path is shown
  And they are never bounced between "/welcome" and a gated route

@security
Scenario: Completion cannot be forged for another user
  Given user A is authenticated
  When A calls mark-complete attempting to target user B's user_id
  Then RLS (auth.uid() = user_id) restricts the write to A's own row
  And user B's welcome_flow_completed_at is unchanged

@security
Scenario: Over-posted / forbidden profile fields are dropped (mass assignment)
  Given a step-f save request includes extra keys like "is_admin", "__proto__", "<script>"
  When the profile is persisted
  Then only allow-listed Basic-Information fields are written
  And the write goes through the ProfileService allow-list + deepSanitize

@security
Scenario: Override mailing-list email requires proof of ownership
  Given a user sets the newsletter override email to a victim's address and opts in
  When the request is processed
  Then no EO subscribe is enqueued until the victim confirms via an emailed link
  And the server response does not reveal whether that address is already a contact

@security
Scenario: Override email rejects malformed and injection payloads
  Given an override email value containing CR/LF or control characters, or a malformed address
  When it is validated on the server
  Then it is rejected before reaching the Email Octopus API

@security
Scenario: Rejected malicious input is logged as a security event (no raw value)
  Given an override email containing CR/LF control characters or a mass-assignment payload
  When the server rejects it
  Then a validation-rejection security event is recorded (user id + kind, never the raw value)
  And no profile write or Email Octopus call occurs

@security
Scenario: Override confirmation cannot be used to email-bomb a victim
  Given repeated opt-ins set the override email to one victim address from many accounts
  Then confirmation sends to that address are throttled below the per-target ceiling
  And a Turnstile challenge is required before any confirmation email is sent
```

---

### 7. Break-glass completion reset — the Step-0 accidental-deletion surface

Support needs a way to **un-complete** a member who finished in a bad state (and it is the only break-glass left now that the launch is flagless — §11.2). That control clears **another user's** completion fact, so it is the **accidental-deletion / privilege** half of the `owasp-secure-coding-bdd` Step-0 check — fully specified here, not deferred:

- **FR-R1** `ProfileService.resetWelcomeFlow(userId)` is **admin-only** — a `SECURITY DEFINER` RPC that calls the shared `has_role(auth.uid(),'admin')` predicate (never an inline role check), rejected with `42501` if the caller is not an admin.
- **FR-R2** It resets **exactly one** `user_id` per call. **No bulk / array / unbounded form exists** — clearing the flag for a cohort would re-gate up to ~767 users at once = mass wrongful lockout, the exact Step-0 failure.
- **FR-R3** Every reset writes a `welcome_flow_reset` audit row (actor, target, timestamp) via `try_write_audit_log`.
- **FR-R4** It is covered by the `@lockout-prevention` scenarios below.

```sql
-- ❌ never — an array / no-admin-check reset: one call re-gates everyone
UPDATE public.profiles SET welcome_flow_completed_at = NULL WHERE user_id = ANY($1);

-- ✅ always — admin-gated, single-target, audited
CREATE OR REPLACE FUNCTION public.reset_welcome_flow(p_target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  UPDATE public.profiles SET welcome_flow_completed_at = NULL WHERE user_id = p_target_user_id;  -- one row
  PERFORM public.try_write_audit_log('welcome_flow_reset','profiles',
          p_target_user_id::text, auth.uid(), ARRAY['welcome_flow_completed_at']);
END; $$;
```

```gherkin
@security @lockout-prevention
Scenario: Break-glass reset is admin-only and single-user
  Given a non-admin member calls resetWelcomeFlow for another user
  Then the call is rejected with a forbidden error
  And no completion flag is changed

@security @lockout-prevention
Scenario: Break-glass reset cannot mass-re-gate the member base
  Given an admin invokes the reset path
  Then it accepts exactly one target user_id and rejects any array / bulk form
  And a welcome_flow_reset audit row records actor, target, and time
```

### 8. Defense-in-depth: CSRF, open redirect, output encoding

- **CSRF — N/A, stated for completeness.** Supabase API auth is a Bearer token in a request header, not an ambient cookie, so the opt-in / override / profile writes are not CSRF-reachable. (Recorded so the `owasp-coverage.md` CSRF row is answered, not left blank.)
- **Open redirect.** The flow introduces no user-controlled redirect target. Any post-completion resume to a stored destination (e.g. `AuthRedirectHandler`) MUST pass the existing `toSafeRedirectPath` owner (`decisions.md` §8) — a stored `?redirect=//evil.test` resolves to a safe same-origin path.
- **XSS / output encoding.** Basic-Information values shown back in Preferences / profile rely on React's auto-escaping; **forbid `dangerouslySetInnerHTML`** on these values, and route any rich text through the `sanitizeHtml` / DOMPurify owner (`decisions.md` §8) — sanitize-on-write (§7.3) and escape-on-render together.

---

## 8. Compliance & Data Lifecycle

This section governs the personal data the Welcome Flow collects, the lawful basis for each field, how consent is captured and proven, and how every new datum is erased on account deletion. It is scoped to the *new* data and *new* consent surfaces the flow introduces; the existing erasure entrypoint, marketing pipeline, and tamper-evident audit log are treated as the substrate this feature must extend correctly — not re-invent.

**Discipline applied:** `compliance-data-lifecycle` (privacy-by-design, data classification + retention, tamper-evident audit logging, GDPR/CCPA data-subject rights, DPIA, erasure propagation). Pairs with `owasp-secure-coding-bdd` (the lockout/accidental-deletion safety check gates the erasure change) and `release-deployment-safety` (expand/contract for the one new column + any new mapping table).

### 1. Data inventory & classification (new data only)

Every field the flow writes is classified before a line of code is written; classification drives retention, erasure, and audit obligations.

| New datum | Where stored | Classification | Lawful basis (GDPR) | Personal data? | Erasure obligation |
|---|---|---|---|---|---|
| `welcome_flow_completed_at` | `profiles` (new col) | Internal | Legitimate interest (product state) | Yes — tied to `user_id` | Erased with `profiles` row (already covered) |
| ~~Welcome-flow goals (step d)~~ — REMOVED (P9) | — | — | — | — | — |
| Newsletter opt-in (step e) | **Email Octopus** (source of truth, ADR-0017); local mirror row in `email_octopus_contact_sync` | Confidential (marketing consent) | **Consent (Art. 6(1)(a))** | Yes (email + first_name) | Already covered by the EO delete-enqueue trigger |
| **Override marketing email (step e)** | **NEW owned mapping** (account-email → marketing-email) | **Confidential — separate erasure path required** | Consent | Yes — a *second*, independent email address | **NOT covered today — see §4. This is the critical gap.** |
| Basic Information (step f) | `profiles` (existing cols) | Confidential | Legitimate interest / consent | Yes | Erased with `profiles` row (already covered) |

**Data minimization is a hard rule, not a preference.** The flow collects only fields that already have a home and a purpose; it introduces exactly **one** new owned column (`welcome_flow_completed_at`) plus (only if the override ships) one mapping table. No free-text "tell us about yourself", no analytics payload, no IP/device capture inside the flow steps.

```ts
// ❌ never — collecting data the flow has no stated purpose for "in case it's useful later"
await profileService.updateFields({ referral_source, marketing_persona, guessed_seniority });

// ✅ always — write only classified fields with a named purpose and an erasure path
await profileService.updateFields({ first_name, last_name, country, portfolio_url, linkedin_url }); // Basic Info, step f (Figma fields)
await profileService.markWelcomeFlowComplete();                                   // completion flag only
```

### 2. Marketing consent under GDPR / CCPA (step e)

The newsletter toggle is **consent**, the strictest lawful basis, and the flow must honor every element of a valid consent.

- **Opt-in, default OFF — enforced in code, not just in copy.** The Switch renders unchecked; the flow enqueues an EO subscribe *only* on an affirmative toggle. Default OFF means we never enqueue on skip/next, so walking past step e records **no** marketing state (`set_my_marketing_subscription` is only called when the toggle is ON). This satisfies GDPR "clear affirmative action" and CCPA — silence/inaction is never consent.

```ts
// ❌ never — pre-checked, or enqueuing subscribe because the user advanced past the step
const [subscribed, setSubscribed] = useState(true);
onNext(() => setMarketing(true)); // consent by omission — unlawful

// ✅ always — OFF by default; only an explicit toggle enqueues opt-in
const [subscribed, setSubscribed] = useState(false);
onSubmit(() => { if (subscribed) setMarketing(true, "welcome_flow"); }); // affirmative action only
```

- **Source + timestamp of consent (the `p_source` record).** Route through the existing fail-open RPC `set_my_marketing_subscription(p_subscribed, p_source)` (`supabase/migrations/20260822120000_email_octopus_sync.sql:70-121`) with `p_source = "welcome_flow"`. **Two blocking prerequisites:** (1) that RPC today only accepts `'signup' | 'profile'` and silently coerces anything else to `'profile'` (`:87-89`) — it must be expanded (expand/contract, additive) to accept `'welcome_flow'`; (2) the comment at `:69` states `p_source` "is accepted and validated for telemetry; **it is not persisted**." Per ADR-0017 amendment (`docs/adr/0017-…:67-83`), consent origin/timing is evidenced by *EO's own record* plus the sync row's `updated_at`/`attempt_history`. That is the consent proof of record — the DPIA and privacy notice must name EO as the consent register, and we must not claim a local consent ledger we do not keep.

- **EO double-opt-in copy implications.** If the EO list is configured for double opt-in, the platform toggle reflects *intent*, and subscription is not complete until the member confirms via EO's email. Step-e copy must not assert "You're subscribed" — it states the affirmative intent and that a confirmation email may follow (avoid implying a completed state the EO confirmation hasn't reached). **Confirmed (P5): the EO list uses double opt-in.** The step-e copy (§4.7 FR‑e1) therefore promises a confirmation email and the toggle reflects intent, not a completed subscription.

- **Withdrawal is as easy as granting.** The same toggle, in the flow and in the profile Preferences area, flips to unsubscribe via the same RPC (`p_subscribed=false`). A dropped opt-**out** is a compliance breach, which is exactly why the EO queue is durable + fail-open with a paged DLQ (`get_eo_sync_health`, `:254-271`) — the flow inherits this and must not add a synchronous EO call on the step-e submit path.

### 3. The override-email erasure gap (CRITICAL — blocks the override sub-feature)

The brief requires the mailing-list email to be **overridable** (prefilled with the signup email, but changeable). This is the single highest-risk item in the whole feature from a compliance standpoint, and it is **not supported today**.

**Why it is a genuine erasure gap:** account deletion is the one erasure entrypoint — `BEFORE DELETE ON auth.users`. Both erasure triggers key strictly on `auth.users.email`:
- `handle_user_deletion()` scrubs `email_send_log`/`gumroad_sales` by `OLD.email` (`supabase/migrations/20260810130000_…:44-63`).
- `eo_enqueue_contact_delete_on_user_deletion()` enqueues the EO delete for `OLD.email` only (`supabase/migrations/20260822150000_…:46-62`).

An override marketing address is, by definition, **different from `auth.users.email`**. On account deletion, EO would receive a delete for the *account* email — which may never have been subscribed — while the **override address stays subscribed in Email Octopus forever**. That is an unremediated right-to-erasure failure (GDPR Art. 17) for a third-party subprocessor, and it would pass CI silently because nothing today knows the override address exists.

**Required erasure cascade the override mapping MUST add (all four, or the override does not ship):**

1. A new **owned** table (e.g. `marketing_email_overrides(user_id uuid PK/FK, marketing_email text, created_at, updated_at)`) — single writer, its own RLS (`auth.uid() = user_id`, row-scoped like `profiles`), server-side email validation (RFC + normalized `lower()`), and its own self-only display read RPC (`get_my_marketing_email`) so the flow/profile never read `profiles.email` for the toggle's displayed address.
2. **`handle_user_deletion()` must enqueue an EO `deleted` for the override address too** — call `enqueue_eo_contact_delete(marketing_email)` for the departing user's override row before deleting it, so EO erases the address the member was *actually* subscribed under. (Edit the **winning** definition — currently `supabase/migrations/20260911120000_erasure_completeness_reconcile.sql:23` — via a new `CREATE OR REPLACE` migration; the `20260810130000` citation above is the historical original, not the live owner.)
3. **The override table must be added to the erasure-completeness `REQUIRED` allowlist** (`scripts/ci/check-erasure-completeness.mjs:41-54`, ADR-0039), so the static guard forces every future redefinition of `handle_user_deletion()` to keep erasing it. Omitting it fails CI red — this is how the gap becomes structurally impossible to re-introduce.
4. A **pgTAP behavioral test** in `supabase/tests/` proving: given a user with an override address, on `DELETE FROM auth.users` the override row is gone AND an EO `deleted` intent exists for the override address (mirrors `supabase/tests/eo_contact_delete_test.sql`).

```sql
-- ❌ never — override address collected but erasure still keys only on auth.users.email
CREATE TRIGGER eo_enqueue_contact_delete_before_user_delete BEFORE DELETE ON auth.users …
-- handle_user_deletion() enqueues delete for OLD.email ONLY → override address orphaned in EO forever

-- ✅ always — erase BOTH addresses; override table is in the REQUIRED guard list
-- inside handle_user_deletion(), before deleting the mapping row:
PERFORM public.enqueue_eo_contact_delete(
  (SELECT marketing_email FROM public.marketing_email_overrides WHERE user_id = OLD.id));
DELETE FROM public.marketing_email_overrides WHERE user_id = OLD.id;
-- and add "marketing_email_overrides" to REQUIRED in check-erasure-completeness.mjs
```

Because the override extends subprocessor-owned consent to a *second* identity, it **warrants its own ADR** (EO ownership extension) per the design brief item 10 — do not fold it into the mandatory-gate ADR.

> **Descope option (recommended for v1):** the override is the only part of step e that opens a net-new erasure path, a net-new owned table, and a second EO identity. If Figma/product can defer it, ship the newsletter toggle keyed on `auth.users.email` (fully covered by existing erasure) and land the override behind its own ADR + the four cascade requirements above. Flag as a product decision (TBD).

### 4. Audit logging of consent changes + the completion event

The repo already has a **tamper-evident, append-only audit log**: `public.audit_log` carries a SHA-256 hash chain (`prev_hash`/`row_hash`, `supabase/migrations/20260423204012_…:260-291`), is RLS admin-read-only with writes only via the `SECURITY DEFINER` `write_audit_log` / fail-open `try_write_audit_log` (`20260315195132_…:21-37`; `20260430021349_…:21-48`), stores **field names not values** (`changed_fields text[]`, no PII), and is **deliberately retained through erasure** for the SOC 2 hash chain (`20260810130000_…:65`, `20260812180000_…:70`). The flow logs *into this existing owner* — it must not invent a second audit store.

- **Marketing consent change → audit event.** Each opt-in/opt-out (flow or profile) records an audit entry: `event_type = 'marketing_consent_changed'`, `record_id = user_id`, `user_id`, `changed_fields = ['subscribed']`, plus source. Who/when/outcome; **no email value in the log** (the address is PII and lives in EO + the mapping table, not the audit row). This gives the "clear affirmative action, recorded" proof GDPR/CCPA require.
- **Welcome-flow completion → audit event.** `event_type = 'welcome_flow_completed'`, written once by the single writer (`ProfileService.markWelcomeFlowComplete`), so completion is attributable and tamper-evident — useful for disputes ("I was never onboarded") and for the mandatory-gate rollout audit.
- **Consent audit must be fail-open, never blocking.** Use `try_write_audit_log` (it swallows-then-warns), so an audit hiccup never blocks the member's consent write — but the write *is* attempted. An empty/ignored catch here would hide a compliance-relevant failure.
- **Audit-log retention & lawful basis for post-erasure retention.** The `audit_log` is retained *through* account erasure for the SHA-256 hash-chain integrity (SOC 2). The lawful basis for keeping a `user_id`-keyed audit row after erasure is **GDPR Art. 17(3)** (compliance obligation + legitimate interest in the tamper-evident chain); the row carries **field names only, never values**, so no erasable PII remains in it. State the retention period in the privacy notice.

```ts
// ❌ never — consent change with no durable, attributable record (unprovable to an auditor)
await setMarketing(true, "welcome_flow"); // and nothing else

// ✅ always — consent + completion are audited into the ONE tamper-evident owner (field names, not values)
await setMarketing(true, "welcome_flow");           // RPC records intent + EO timestamp (consent register)
// server-side (RPC/trigger): PERFORM try_write_audit_log('marketing_consent_changed', 'email_octopus_contact_sync', v_uid::text, v_uid, ARRAY['subscribed']);
```

**Profile-change audit coverage — a MANDATE, not a decision (step f).** The existing `audit_profile_changes` trigger tracks `first_name,last_name,country,discord_username,display_name,avatar_url,bio,professional_background` (`20260315195132_…:52-65`). Of the surfaced step-f fields, `first_name,last_name,country` are **already** covered, but **`portfolio_url` and `linkedin_url` are NOT** in the trigger's `changed_fields` list. These are personal-data writes the flow performs, so **extend `audit_profile_changes` to include `portfolio_url,linkedin_url`** — leaving new PII fields unaudited while the flow writes them is an audit-coverage regression, not a deferrable choice. (The completion timestamp stays unaudited by conscious decision — §6.8; goals/timezone/scheduling_url are not written by this flow. This is the §15 P6 answer.)

### 5. Data-subject rights coverage for the new data

The platform already exposes DSARs via `dsar-submit` → `submit_dsar` RPC with types `access, portability, correction, erasure, restrict, object, appeal, human_review, withdraw_consent` and a 30-day SLA (`supabase/functions/dsar-submit/index.ts:14-24,76`). Every new datum must be reachable by each right:

| Right | New-data coverage requirement |
|---|---|
| **Access / portability** | The completion flag + step-(f) Basic-Information fields are on `profiles` → included in any profile export. Override marketing email must be **added to the export payload** (it lives outside `profiles`). Newsletter status is read via `get_my_marketing_subscription()` / EO. |
| **Rectification** | Step-(f) Basic-Information fields editable bidirectionally via the ONE `ProfileService` owner (flow ↔ EditProfile). Override email editable via its owned RPC with re-validation. |
| **Erasure** | Covered by §3 for the override; completion flag + Basic-Info erased with the `profiles` row. |
| **Withdraw consent** | Newsletter toggle flips to unsubscribe (same RPC) — already an explicit DSAR type. |
| **Restriction / objection** | **The flow collects no profiling/preference data** (step (d) goals removed, P9) — the only inputs are the optional newsletter consent (withdrawable, above) and optional Basic-Information fields (rectifiable/erasable, above). There is no profiling signal to restrict. |

### 6. Retention & minimization

- **Goals + completion flag** live for the account lifetime and die with the `profiles` row — no separate retention timer needed (they are low-volume, one row per user).
- **Override mapping** follows the same lifetime-then-erased model; no aged-row prune needed (one row per user, overwritten in place).
- **No new long-lived PII sink.** The flow deliberately adds no append-only log of answers, no per-step analytics rows, no snapshot table — so it introduces no new retention job (unlike `prune_gumroad_raw_payloads` / `prune_handoff_productions`, which exist because those stores accrete PII). If product later wants step-level funnel analytics, that is a *separate* classified datum with its own retention + erasure ADR — not something to bolt onto this flow.

### 7. DPIA-style risk note — making onboarding mandatory

**The risk:** a mandatory, un-skippable flow shown to all ~767 existing users + every new signup could be read as **coercing data collection** — GDPR requires consent to be *freely given*, and bundling data-sharing into an un-skippable gate undermines that.

**The mitigating design (must hold true, or the DPIA fails):** distinguish **"must walk through the flow"** from **"must consent or share."**

- The **flow is mandatory** (you must see the welcome/education steps and reach the end). That is lawful — it is product onboarding, not data collection.
- Every **data-sharing input is genuinely optional**: step-e newsletter is **OFF by default** and step-f profile fields are **not required to advance** (with step (d) removed there is no goal-toggle input at all). A member can complete the entire flow, share nothing, and reach `welcome_flow_completed_at` — and the gate releases them. **This is the invariant that makes mandatory onboarding lawful and must be enforced in code and proven by a BDD scenario**, not merely intended.

```gherkin
@compliance @dpia
Scenario: A member can complete mandatory onboarding without sharing or consenting to anything
  Given a first-time member enters the mandatory Welcome Flow
  When they advance through every step without toggling goals, without opting into the newsletter,
    and without filling any profile field
  Then the flow completes and welcome_flow_completed_at is set
  And no marketing opt-in was enqueued to Email Octopus
  And no goals were written to their profile
  And the gate releases them to the app
```

- **Consequence controls:** because the flow is mandatory, the gate itself is lockout-sensitive — a failed profile fetch must surface a retry/error state, never trap a member on `/welcome` forever nor let them bypass (cross-references the Security/Gate section; called out here because *forced* exposure of a broken gate is also a privacy-of-service harm).
- **Residual risk reduced:** the step-d goals profiling signal is **removed entirely** (P9), so the flow collects no preference/profiling data — only the newsletter opt-in (consent) and optional Basic-Information fields. No automated decision with legal/similar effect is made → no Art. 22 concern.
- **DPIA document:** extend the existing `docs/compliance/email-octopus-dpia.md` (or add a Welcome-Flow DPIA section) covering the mandatory gate + the override-email subprocessor extension. This is an explicit deliverable of the second ADR.

### 8. Consent & erasure requirements checklist

**Consent (step e):**
- [ ] Newsletter Switch renders OFF by default; opt-in enqueued **only** on affirmative toggle (never on skip/next).
- [ ] `set_my_marketing_subscription` expanded (additively) to accept `p_source = 'welcome_flow'`.
- [ ] Step-e copy reflects the **confirmed** double-opt-in reality (P5): it promises a confirmation email and makes no false "subscribed" claim (§4.7 FR‑e1/e2).
- [ ] Marketing opt-in/opt-out writes a `marketing_consent_changed` entry via `try_write_audit_log` (field names, no email value).
- [ ] Withdrawal path is the same toggle in flow **and** Preferences, sharing the one RPC.
- [ ] Privacy notice / DPIA name EO as the consent register of record (no false local-ledger claim).

**Erasure (override email — all required if the override ships):**
- [ ] New owned `marketing_email_overrides` table: single writer, row-scoped RLS, server-side email validation, self-only display RPC.
- [ ] `handle_user_deletion()` enqueues an EO `deleted` for the override address **and** deletes the mapping row.
- [ ] `marketing_email_overrides` added to `REQUIRED` in `scripts/ci/check-erasure-completeness.mjs` (ADR-0039 guard).
- [ ] pgTAP test proves override address is erased in DB + enqueued for EO delete on account deletion.
- [ ] Override address included in the DSAR access/portability export payload.
- [ ] Dedicated ADR for the EO-ownership extension (override email) — separate from the mandatory-gate ADR.

**Erasure (rest of feature):**
- [ ] Goals + completion columns verified to die with the `profiles` row (covered by existing `handle_user_deletion` profiles delete — no new REQUIRED entry needed since they're columns, not a table).
- [ ] `welcome_flow_completed` completion event written once by the single writer.
- [ ] Extend `audit_profile_changes` to cover the surfaced step-f fields it doesn't already track (`portfolio_url`, `linkedin_url`) — mandate per P6 (first/last/country already audited; goals removed; timezone/scheduling_url not collected).

**DPIA:**
- [ ] BDD scenario proves a member can complete the mandatory flow sharing/consenting to nothing.
- [ ] No profiling/preference data is collected (step-d goals removed, P9) — the DPIA inputs are only the optional newsletter consent + optional Basic-Information fields; restriction/objection is therefore trivially satisfied.
- [ ] Welcome-Flow DPIA section added covering mandatory gate + override subprocessor extension.

### 9. Compliance artifacts & control mapping (the repo expects these per PII feature)

This repo ships standard, committed compliance artifacts for every PII feature — `docs/compliance/` already holds `spf-handoff-control-matrix.md`, `spf-handoff-data-classification.md`, `spf-handoff-dpia.md`, `privacy-runbook.md`, and `email-octopus-dpia.md`. This feature must produce the same set; the DPIA alone (§8.7) is not enough:

- [ ] **`docs/compliance/welcome-flow-control-matrix.md`** — map each control (consent capture, override-email erasure cascade, audit logging, access/RLS, change management) → implementation → evidence location (the pgTAP suite, the `check-erasure-completeness` REQUIRED entry, the `owasp-coverage.md` rows), mirroring `spf-handoff-control-matrix.md`. This **is** the SOC 2 / ISO 27001 control-to-evidence mapping for the feature.
- [ ] **Update `docs/compliance/privacy-runbook.md`** with the new DSAR export field (override email) and the override erasure step.
- [ ] **Update the subprocessor register / EO DPA record and the Art. 30 ROPA** to reflect mandatory onboarding + the override as a **second EO identity** — explicitly noting **no new subprocessor and no new transfer border** (EO is an existing subprocessor), which closes the data-residency question.
- [ ] Confirm the §8.1 classification table is the **classification artifact of record** (or split it into `welcome-flow-data-classification.md` per repo convention).

These are deliverables of ADR 20261009-welcome-flow-eo-extension and the build phase, not optional.

---

## 9. Reliability & Operational Readiness

> Discipline: `sre-operational-readiness`. This section defines how we know the Welcome Flow is healthy from the **user's** point of view, what we page on, how each dependency degrades, and the runbook + launch gate. It assumes the architecture decided elsewhere in this doc: a mandatory route gate on `welcome_flow_completed_at`, a single-writer `ProfileService`, EO reuse via the fail-open RPC set, and — flagless (§11.2) — a fast frontend revert as the only rollback (no flag kill switch).

### 0. What "always works" actually means here (honest degradation)

This feature is a **mandatory, un-skippable gate in front of ~50 authenticated routes** (`src/components/ProtectedRoute.tsx`). That makes it the single most lockout-sensitive surface we will ship this year. We do **not** promise "the Welcome Flow never fails." We promise two *bounded* guarantees and name their failure modes:

| Guarantee | What it means | How it can still fail | Our defense |
|---|---|---|---|
| **No wrongful lockout** | A user whose flag is set, or who should be let through while we can't read the flag, is never trapped on `/welcome`. | Profile fetch is down → gate can't read `welcome_flow_completed_at`. | Explicit `error` state with retry; gate **fails toward a visible, recoverable error page**, never an infinite spinner or silent redirect loop. |
| **No wrongful bypass** | An un-onboarded user cannot reach gated routes by manipulating the client. | Client-only gate is bypassable by design (it is UX, not authz). | The gate is **UX enforcement only**; RLS on `profiles` (`auth.uid() = user_id`) is the real security boundary. Bypassing the gate exposes nothing the user isn't already authorized to read/write. |

The honest framing: **the gate is a client-side redirect. It is correct availability, not a security control.** If someone bypasses it, they see the app early — they do not gain privilege. If the flag *write* is lost, the worst case is the user sees the flow a second time (annoying, not harmful). If the flag *read* is lost, the user must never be stuck — that is the one failure we engineer hard against.

### 1. SLIs / SLOs / error budget

There is no Prometheus/PagerDuty in this stack. Our telemetry substrate is: `report()` → `classify()` → `audit_log` / `ops_events` (via `record_event`, `supabase/migrations/20260602230329_*.sql:62`), the per-minute classified-drop aggregate (`src/lib/observability/report.ts`, ADR-0031), `log.track()` service timing (`src/services/logger.service.ts`), and the admin **System Health** dashboards (`src/pages/SystemHealthPage.tsx`). SLOs are measured off these, and "the dashboard" below means a **new Welcome Flow tab** alongside the existing `IncidentsTab` / `PerformanceTab` / `EdgeFunctionsTab`.

| # | SLI (measured close to the user) | Definition (good / valid) | SLO (28-day rolling) | Primary? |
|---|---|---|---|---|
| **S1** | **Gate correctness — no wrongful lockout** | `1 − (sessions that hit the /welcome error/retry state AND never reach a gated route ÷ sessions with a set flag)` | **≥ 99.95%** | ✅ (hardest) |
| **S2** | **Gate correctness — no wrongful bypass** | `1 − (gated-route loads by users with NULL flag & flag-read succeeded ÷ gated-route loads)` | **≥ 99.99%** | ✅ |
| **S3** | **Flow render availability** | `/welcome` first step renders interactive ÷ `/welcome` mounts | **≥ 99.9%** | ✅ |
| **S4** | **Completion-write success rate** | successful `markWelcomeFlowComplete` ÷ attempts (after in-client retry) | **≥ 99.5%** | ✅ |
| **S5** | **Step latency** | fraction of step→step transitions rendered < 400 ms (p95), measured client-side via `log.track` | **p95 < 400 ms** | |
| **S6** | **Preference/profile write success** | successful `ProfileService.updateFields` from the flow ÷ attempts | **≥ 99.5%** | |
| **S7** | **EO opt-in → synced latency** | opt-in recorded → `email_octopus_contact_sync.status='synced'` | **reuse existing EO worker SLO** (do not invent a new one — p95 **TBD-1**, inherit from the email-rearchitecture worker) | |

**Error budget.** S1 at 99.95% over 28 days ≈ **~0.3% of onboarding sessions** may hit a recoverable error page. Budget policy: **if S1 or S2 burns fast, revert the deploy (§9.5) before any debugging** — mitigate first. (Flagless launch: the revert takes minutes, not a ≤60s flag flip, so the on-call owner must act immediately — §9.9.) S2 (wrongful bypass) is capped tighter because it is also a correctness/product-integrity signal, but note again it is **not** a security budget: RLS is the floor.

> **SLA:** none. This is an internal product feature with no external contract. Do not write one.

### 2. Four golden signals — exact instrumentation points

Reuse the existing pipeline. **Do not invent a parallel metrics system** (that is the drift this house bans).

```ts
// ❌ never — a bespoke counter the dashboard can't see and nothing gates on
let welcomeFails = 0;
try { await profileService.markWelcomeFlowComplete(uid); }
catch { welcomeFails++; }                    // swallowed; invisible to System Health

// ✅ always — go through the one reporter so it lands in ops_events + the dashboard
try {
  await profileService.markWelcomeFlowComplete(uid);   // log.track wraps timing (S4/S5)
  reportActivity("welcome_flow.completed", { source: "welcome-flow" });
} catch (err) {
  report(err, { source: "welcome-flow.complete", eventType: "welcome_complete_failed",
                severity: "error" });         // classify() → ops_events → dashboard + alert
  throw err;                                   // caller shows retry (recover), never hides it
}
```

| Signal | Where it is emitted for the Welcome Flow | Backing store |
|---|---|---|
| **Latency** | `log.track` already wraps `ProfileService.fetch/updateFields` (`src/services/profile.service.ts:42,158`); add a client mark per step transition (S5) and around `markWelcomeFlowComplete` (S4). **Split success vs error latency** — a fast failure is not "fast." | `ops_events` / logger timing |
| **Traffic** | `welcome_flow.step_viewed` activity per step (a, b, c, d, e, f, g) with a step tag → funnel + drop-off. | `ops_events` (low-cardinality kind) |
| **Errors** | `report()` calls tagged `source:"welcome-flow.*"`, `eventType` in `{welcome_gate_error, welcome_complete_failed, welcome_pref_write_failed}`. Reuse `invokeEdge`'s built-in edge failure reporting for the EO RPC path (`src/lib/edge/invokeEdge.ts:164-183`). | `audit_log` + `ops_events` |
| **Saturation** | This is a client SPA + Postgres; the saturation that matters is **EO queue backlog depth** (`email_octopus_contact_sync` pending rows) and **DB connection pressure on `profiles` writes at the ~767-user cutover spike**. Reuse the existing EO backlog surfacing (`EmailControlCenterTab` / `EmailDlqPanel`). | `email_octopus_contact_sync` counts |

**Correlation:** every gate read, completion write, and EO RPC already carries `x-trace-id` (`invokeEdge` :99–100). All Welcome Flow `report()` calls MUST pass the same `traceId` so one stuck session is followable across step → write → EO enqueue. **No new PII in telemetry** — never log the override mailing-list email or profile field values; log the user id and event kind only.

### 3. Alerts — page only on real user harm

We have no pager today. Be honest: "alert" here means **a symptom-based rule evaluated over `ops_events` that raises a System Health incident row** (`IncidentsTab`) and, where a real notification channel exists, routes to it. A true human-reachable paging channel is **mandated in §9.9 (mustFix before the gate PR merges)** — an alert that fires into a dashboard nobody is watching at 2 a.m. is not an alert.

```gherkin
@reliability
Scenario: Wrongful-lockout spike pages on-call
  Given the Welcome Flow gate is live for some cohort
  When the rate of "welcome_gate_error" sessions that never reach a gated route
       sustains a 14.4x burn of the S1 budget for 5 minutes
  Then a high-severity alert is raised linking to the Welcome Flow runbook
  And the recommended first action is "revert the frontend bundle (flagless — §9.5)"

@reliability
Scenario: Redirect-loop detector
  Given a user session
  When it records more than 5 redirects to /welcome within 60 seconds
  Then a redirect-loop alert is raised for that build cohort
  And it is deduped to one alert per cohort, not one per session
```

**Pages (act now):**
- **S1 fast burn** — wrongful-lockout rate spikes (users stuck on `/welcome`). Highest severity.
- **Redirect-loop detector** — >5 `/welcome` redirects/60s for a session, aggregated per build cohort (the classic `ProtectedRoute` ↔ `AuthRedirectHandler` fight). Dedupe to one page per cohort.
- **S4 fast burn** — completion-write failure spike (users finish but can't be marked done → they re-see the flow forever).
- **S2 breach** — sustained wrongful bypass (correctness regression in the gate predicate).

**Must NOT page (dashboard/ticket only):**
- ❌ A single user's profile-fetch retry, an `AbortError`, offline/hidden-tab fetch failures — `classify()` already drops these structurally (`src/lib/observability/classify.ts`); they must not resurface as pages.
- ❌ **EO sync lag or a full EO DLQ** — EO is fail-open (ADR-0017); a delayed newsletter sync harms no one *now*. Ticket, not page. Only page if it reuses the existing EO worker's own alerting, not a new one.
- ❌ Step-latency p95 (S5) exceeding 400 ms — degraded UX, not harm. Slow-burn ticket.
- ❌ Individual preference-write failures (S6) — the flow continues; retried next profile save.
- ❌ CPU/DB "high" with users fine — symptom-based only.

### 4. Graceful degradation per dependency

```ts
// ❌ never — trap the user when we can't read the flag
if (profileLoaded && profile?.welcome_flow_completed_at == null) {
  return <Navigate to="/welcome" />;   // but what if the fetch ERRORED, not "not done"?
}
// This treats "unknown" as "not onboarded" → an errored fetch loops the user to /welcome forever.

// ✅ always — three explicit states, none of which traps or silently bypasses
if (!profileLoaded) return <FullPageSpinner />;              // loading: wait
if (profileFetchError) return <WelcomeGateError onRetry={refreshProfile} />; // recover
if (profile.welcome_flow_completed_at == null) return <Navigate to="/welcome" replace />;
return children;                                             // done: through
```

| Dependency down | Symptom | Degradation (decided) |
|---|---|---|
| **Profile fetch** (`AuthContext.refreshProfile`) | Gate can't read flag | Show **recoverable error state** with retry (above). **Never** infinite spinner, **never** default-open the gate, **never** default-trap. This is the one path we test hardest. |
| **`ProfileService` write** (completion / preferences / profile) | Finish button fails **or hangs** | **Bounded write** — `withBoundedSave` (15 s) + `retryPostgrest` transient retry. ProfileService is **direct supabase-js, NOT `invokeEdge`** (§6.5), so a hung write cannot silently spin forever on the final step; on timeout/failure show inline error, keep the user on the step, and `report()` it (S4/S6). Completion is **idempotent** — a retried `markWelcomeFlowComplete` on an already-set flag is a no-op, never an error. |
| **EO worker / queue** (`email_octopus_contact_sync`) | Opt-in not yet synced | **Fail-open (ADR-0017):** the toggle save and the whole flow succeed regardless; intent is recorded locally and the durable queue (version-ordered, DLQ at 8 attempts) delivers eventually. The flow **never blocks on EO**. Default OFF means we only enqueue on opt-in. |
| **Override-email validation service** (new, ADR 20261009-welcome-flow-eo-extension) | Can't validate override | Reject the override, keep the prefilled signup email, let the flow proceed. Never block completion on an optional field. (Depends on ADR 20261009-welcome-flow-eo-extension.) |
| *(No feature-flag dependency — flagless launch, §11.2.)* | — | The gate has no flag-service dependency to fail; it arms on `welcome_flow_completed_at` alone. The removed risk (flag-service outage) is gone; the added risk (no instant kill) is recorded in §11.2. |

### 5. Rollback — frontend revert (no instant kill; flagless)

**There is no flag kill switch (flagless 100% launch — §11.2, product decision).** Rollback is a **frontend revert**: promote the previous Cloudflare Pages bundle (`wrangler versions deploy <prev-id>@100%`) or revert the commit → rebuild — on the order of **minutes**, affecting the whole userbase until it ships. The column (`welcome_flow_completed_at`) stays (additive/expand-contract, auto-applied per ADR-0045); **never** couple rollback to reverting the migration. Because recovery is slow, the primary defenses are the lockout-safety merge-gate (§9.8) and the fail-safe three-state gate; a named launch owner must be on-call to execute the revert fast (§9.9).

### 6. Runbook — Welcome Flow

> Lives at `docs/runbooks/welcome-flow.md` (create with the feature). Linked from every alert. Copy-pasteable.

**Service:** mandatory onboarding gate + flow. **Owner:** platform. **Rollback (no flag):** frontend revert (previous bundle / revert commit → rebuild), minutes — §9.5.

| Symptom | Check | Mitigate |
|---|---|---|
| Users report "stuck on welcome page / can't reach app" | Welcome Flow tab → S1 burn; `ops_events` `welcome_gate_error` rate; redirect-loop detector | **Revert the frontend bundle first (§9.5, minutes).** Then diagnose: profile-fetch health, `AuthRedirectHandler` vs gate ordering. |
| "I finished but it shows again" | S4 completion-write failures; check `markWelcomeFlowComplete` errors in `ops_events` | Revert the bundle if widespread; verify `welcome_flow_completed_at` is in `ProfileService.fetch` select (else `useAuth().profile` never sees it). |
| Redirect loop | Redirect-loop alert cohort; confirm `/welcome` + sign-out allowlisted; MFA guard sequenced **before** gate | Revert the bundle; fix allowlist/sequencing; redeploy. |
| Newsletter not arriving | EO backlog (`EmailControlCenterTab`), `email_octopus_contact_sync` pending/dlq | **Do not page.** Reuse EO worker runbook; flow is fail-open and unaffected. |
| Completion flag mass-wrong after cutover | Confirm NULL-means-show (no backfill-as-complete); confirm single writer | If a backfill went wrong, it is data, not code — reconcile via `ProfileService`, never a second writer. |

**Deploy/rollback:** merge → Cloudflare Pages auto-deploys FE; migration auto-applies (ADR-0045, expand/contract). Rollback = **revert the frontend bundle** (no flag; minutes), never a migration revert.

### 7. Production-Readiness Review (launch gate)

- [ ] S1–S4 SLOs wired to a Welcome Flow System Health tab; error-budget policy (bundle-revert on S1/S2 fast burn — §9.5) agreed.
- [ ] Four golden signals emitted via `report()`/`log.track`/`ops_events` with shared `x-trace-id`; **no new PII in telemetry**.
- [ ] Symptom alerts defined (wrongful-lockout burn, redirect-loop, completion-write burn) and **routed to a human-reachable channel** per §9.9 (resolves TBD-2 — a Slack/Discord webhook + email to the platform owner, or a named on-call for the launch window).
- [ ] Non-harm signals (EO lag, step latency, single retries) explicitly **do not page**.
- [ ] Gate degradation proved by test for all three states: loading spinner, **error-with-retry (no trap)**, and no-bypass — the `@reliability` lockout-safety scenarios pass in CI.
- [ ] Completion write is **idempotent**; retried no-op verified.
- [ ] EO path confirmed fail-open; flow never blocks on EO.
- [ ] **Fast-revert rehearsed end-to-end (flagless — §9.5):** previous Cloudflare Pages bundle promoted / commit reverted → gate inert on next load; wall-clock-to-recovery measured and recorded in the runbook.
- [ ] Runbook `docs/runbooks/welcome-flow.md` written, linked from alerts, first action = **revert the frontend bundle** (§9.5).
- [ ] **Cutover capacity — decided (TBD-4 resolved), flagless.** There is no ramp; the capacity control is that cutover writes are **naturally bounded by organic login arrival** (`peak logins/min`), each a single indexed row update on row-scoped RLS (§5.6). Even a 100%-at-merge launch only converts a user on their *next login*, so the spike is the normal daily login curve, never a synchronized 767-write burst; it never exceeds `profiles` write headroom, so **no load/soak test is warranted** (§10.1). Confirm completion-write p95 and **zero PgBouncer checkout timeouts** at the first post-launch daily login peak (the §3 NFR).
- [ ] **Named launch on-call owner** staffed through the launch window + the first 72 h, with a documented escalation path (§9.9).
- [ ] **Incident severity levels + IC / comms / scribe roles** defined (§9.9); blameless-postmortem commitment for any SEV1/SEV2.
- [ ] **PRR signed off by a named approver before the gate PR (PR5) merges** — the gate is not self-certified; the merge IS the launch (§11.2).
- [ ] **Supabase PITR confirmed enabled** on prod; backup/DR posture recorded (§8.9 / §6.12).
- [ ] `npm run check:architecture` exit 0 + `judge-arch` PASS (blocking, per CLAUDE.md).

### 8. Reliability behaviors as tests (`@reliability`)

```gherkin
@reliability
Scenario: Failed profile fetch never traps the user
  Given the profile fetch errors for a signed-in user
  When they load any gated route
  Then they see a Welcome Flow error page with a working Retry
  And they are not redirected to /welcome in a loop
  And a successful Retry lets them through to their destination

@reliability
Scenario: Completion write is idempotent
  Given a user whose welcome_flow_completed_at is already set
  When markWelcomeFlowComplete runs again (retry/double-click)
  Then it succeeds as a no-op and records no error

@reliability
Scenario: EO down does not block onboarding
  Given the Email Octopus worker is unavailable
  When a user opts into the newsletter and finishes the flow
  Then the flow completes and lands them on /dashboard
  And the opt-in intent is queued for later delivery

@reliability
Scenario: Reverting the frontend bundle makes the gate inert (flagless rollback — §9.5)
  Given the previous frontend bundle (without the gate) is promoted
  When any user signs in
  Then they are never routed to /welcome and land normally
  And the completion fact in the database is left untouched for a later re-launch
```

### 9. Incident response & on-call (launch gate — resolves TBD-2)

The alerting (§9.3) and the fast-revert rollback (§9.5) are *designed* but, without a human to act on them, un-actionable: an alert that raises an `IncidentsTab` row nobody watches at 2 a.m. is not an alert, and "revert the bundle" only mitigates if someone is paged to do it. **Flagless makes this sharper**, not softer — with no ≤60s flag flip, recovery is a minutes-long bundle revert that a named human must execute. For a gate on **every login** this is launch-blocking — it must close before the gate PR (PR5) merges.

- **Paging channel (closes TBD-2).** High-severity `IncidentsTab` rows for `source:"welcome-flow.*"` route to a **human-reachable channel** — a Slack/Discord webhook **plus** an email to the platform owner — not only the dashboard. If no true pager exists, a **named human is on-call** for the launch window (the gate-PR merge + the first 72 h) with a documented notification path.
- **Escalation.** Primary acknowledges within 15 minutes → else secondary → else the product owner. Named people, not "platform."
- **Severity levels.**
  - **SEV1** — the mandatory gate wrongfully locks a cohort out of all gated routes (stuck on `/welcome` / redirect loop). The defining SEV1 for this feature.
  - **SEV2** — completion-write failures make many members re-see the flow, or EO sync is fully stalled > 24 h.
  - **SEV3** — step-latency / cosmetic.
- **Roles.** Name an **Incident Commander** (coordinates, does not debug), a **comms updater**, and a **scribe**. **First mitigation is ALWAYS the frontend bundle revert** (§9.5/§9.6), before diagnosis.
- **Blameless postmortem** within 3 business days for any SEV1/SEV2; action items owned and dated. **Any lockout with a code cause produces a `@reliability` regression test** (ties §9.8) so the same failure cannot silently return.

---

## 10. Test Strategy

This section owns the **full test mix** for the Welcome Flow, applying `comprehensive-test-strategy` (the pyramid, contract, quality gates, flaky-test hygiene) and `bdd-comprehensive-testing` (the Gherkin behavioral layer + CI wiring). It is grounded in the repo's actual harness: Vitest jsdom units (`vitest.config.ts`), Playwright e2e (`playwright.config.ts`), and the two blocking gates `ci / gate` and `bdd-gate.yml`.

**Core principle applied:** test each Welcome Flow risk at the *lowest level that can catch it*. The gate's decision logic, the option→CTA map, and the allow-list are pure → **unit**. The gate ↔ AuthContext ↔ router wiring is a seam → **integration (jsdom render)**. The EO RPC and `eo-contact-status` are a service boundary → **contract**. Un-skippability and complete-once are whole-system journeys → **e2e**. This feature has **no hot path or new external fan-out**, so no load/soak/spike suite is warranted — the ~767-member cutover write-spike is bounded by the canary ramp, not a test (§9.7, decided). Resilience is covered by the lockout-safety fault-injection tests below, not a chaos harness. The one declared latency SLO (S5, p95 < 400 ms) is **prod-observed via `log.track`, not a CI gate** (an optional lightweight Playwright step-transition timing assertion is noted in §10.7) — a declared SLO must have a stated measurement path, and this is it.

### 1. The pyramid for this feature

| Layer | Count (approx) | Runner / where | What it proves | Blocks merge |
|---|---|---|---|---|
| **Unit** | ~45 | Vitest jsdom, `gate-test` shard | Pure decision logic: completion writer, allow-list, `useWelcomeGate` state machine, live-stat-not-counter, override-email validator | ✅ `ci / gate` |
| **Integration** | ~14 | Vitest jsdom (`render` + `MemoryRouter` + mocked `useAuth`) | Gate ↔ ProtectedRoute ↔ AuthContext ↔ routing; step→profile React-Query cache sync | ✅ `ci / gate` |
| **Contract** | ~8 | Vitest (consumer shape) + Deno `*.test.ts` (provider) | `set_my_marketing_subscription`/`get_my_marketing_subscription` arg+return shape; `eo-contact-status` read shape | ✅ `ci / gate` + `deno-check` |
| **E2E** | ~16 scenarios | Playwright `e2e/welcome-flow/*.e2e.ts` | Un-skippable enforcement, complete-once, conditional CTAs, bidirectional sync, newsletter opt-in/override, lockout-safety | ✅ (e2e job) |

**Net-new test tooling required (none present today — decide in this PR, do not defer):**

- **Coverage provider is NOT installed.** `gate-test` runs `npx vitest run --shard=N/4` with *no* `--coverage` (`ci.yml:262`), and no `@vitest/coverage-*` is in `package.json`. A coverage gate on this feature requires adding `@vitest/coverage-v8` + a `vitest --coverage` invocation scoped to changed files. **This is a mustFix**, not an assumption that coverage already runs.
- **No mutation framework (Stryker) and no property-based lib (fast-check).** Use the repo's *existing* discipline instead of inventing infra: the arch-gate ESLint rule (item 23) gets a **guard test** that must pass `verify-guard-test-discrimination.mjs` (`ci.yml:225`) — the repo's real mutation gate, applied to guards. For the override-email validator, add **table-driven exhaustive** unit cases (cheap, deterministic) alongside the fast-check fuzz (§10.7). (The option-key map is gone — step (d) removed, P9.)
- **No Pact.** Contract tests are in-repo two-sided checks (consumer shape test in Vitest + provider Deno test), matching the existing `*.contract.test.ts` convention (e.g. `src/features/auth/services/__tests__/auth-classifier.contract.test.ts`).

### 2. Unit layer — pure logic, no I/O, one behavior each

**A. ProfileService completion writer + read exposure** — `src/services/__tests__/profile.service.welcome.test.ts`

The writer is the single owner of `welcome_flow_completed_at`. Tests mock `@/integrations/supabase/client` (the setup-file stub at `src/test/setup.ts:38` is overridden per-test) and assert the emitted PostgREST payload — never a live DB (forbidden by `check-no-prod-supabase-in-tests.mjs`).

```ts
// ❌ never — a test that only checks the method resolves, asserting nothing about the write
await ProfileService.markWelcomeFlowComplete("u1"); // no expect → mutation-survivor

// ✅ always — assert the exact column, value shape, and scoping
const update = vi.fn().mockResolvedValue({ error: null });
const eq = vi.fn().mockResolvedValue({ error: null });
// ...wire builder... then:
await ProfileService.markWelcomeFlowComplete("u1");
expect(update).toHaveBeenCalledWith(
  expect.objectContaining({ welcome_flow_completed_at: expect.any(String) }), // ISO timestamp, server-owned nullable
);
expect(eq).toHaveBeenCalledWith("user_id", "u1"); // row-scoped, matches RLS auth.uid()=user_id
```

Cases: writes ISO timestamp; scopes by `user_id`; **on PostgREST error throws** (never swallows — `services/CLAUDE.md` "every failure reports"); idempotent re-call does not clear an existing value (write is set-once semantics). **Allow-list regression:** `updateFields` (`profile.service.ts:160`) must still reject `welcome_flow_completed_at` from the generic path — only the dedicated set-once RPC writer may set it (no goals column exists, P9).

```ts
// ✅ the completion flag can NOT be forged through the generic field updater (mass-assignment guard)
await ProfileService.updateFields("u1", { welcome_flow_completed_at: "1999-01-01", is_admin: true });
expect(update).not.toHaveBeenCalledWith(
  expect.objectContaining({ welcome_flow_completed_at: expect.anything() }),
);
```

**B. `fetch()` exposes the new column** — same file. Assert the explicit `.select(...)` string (`profile.service.ts:52`) now contains `welcome_flow_completed_at`, so `useAuth().profile` sees it. A missing column here is the #1 silent failure mode (gate reads `undefined` → treats everyone as incomplete forever).

**C. ~~Option-key / CTA mapping~~ — REMOVED (P9).** Step (d) and the goals constant are out of scope; there is no option-key / CTA-routing test. Step (g) renders only its fixed CTAs (§4.9), always-on and independent of any selection.

**D. `useWelcomeGate` decision logic** — `src/hooks/__tests__/use-welcome-gate.test.tsx`

This is the highest-risk pure logic (lockout-safety). Extract the decision into a pure function `welcomeGateDecision({ profileLoaded, profile, fetchError, path })` returning a discriminated union so it is unit-testable **without** rendering (flagless — no `featureFlagOn` input):

```ts
type GateDecision =
  | { kind: "wait" }                 // profileLoaded=false → spinner
  | { kind: "allow" }                // complete, or on allowlist
  | { kind: "redirect"; to: "/welcome" }
  | { kind: "error-retry" };         // fetch failed → recover UI, NOT a redirect loop, NOT bypass
```

```ts
// ❌ never — a failed profile fetch that falls through to allow() lets users BYPASS the mandatory gate
if (!profile) return { kind: "allow" }; // security hole: fetch error == not-onboarded == full access

// ❌ never — a failed fetch that redirects to /welcome which itself needs the profile = infinite trap
if (fetchError) return { kind: "redirect", to: "/welcome" };

// ✅ always — fetch failure is its own terminal state: show retry, block protected content, never loop
if (fetchError) return { kind: "error-retry" };
```

Exhaustive cases (flagless — no flag case): `profileLoaded=false`→`wait`; `welcome_flow_completed_at` set→`allow`; null + on protected route→`redirect`; already on `/welcome`→`allow` (no self-loop); sign-out route→`allow`; `fetchError`→`error-retry`. Boundary: `welcome_flow_completed_at === ""` (empty string, not null) must be treated as **complete** or **incomplete** deterministically — pick "any non-null ⇒ complete" and test it.

**E. Override-email validator** — `src/lib/__tests__/marketing-email.test.ts` (gated behind the 2nd ADR)

Server-side-mirrored validation for the marketing-email override. Table-driven boundary set: valid address; empty → falls back to signup email; leading/trailing whitespace trimmed; header-injection attempt (`a@b.com\nBcc:`) rejected; unicode/IDN handling decided; over-length (>254) rejected.

**F. Step-f field contract (AC-f3) — no silent drop** — `src/services/__tests__/profile.service.welcome.test.ts`

The single most important previously-missing test: `updateFields` silently drops any key not in the allow-list, so a step-f field missing from EITHER the zod schema or the `ProfileService` allow-list is dropped with no error (the doc itself calls the sibling fetch-select omission "the #1 silent failure mode"). Assert both, per field:

```ts
import { ALLOWED_PROFILE_FIELDS } from "@/services/profile.service";
import { profileUpdateSchema } from "@/lib/validators/profile";
const STEP_F_FIELDS = ["first_name","last_name","country","timezone","portfolio_url","linkedin_url","scheduling_url"] as const;
it.each(STEP_F_FIELDS)("step-f field %s is in BOTH the zod schema and the allow-list (no silent drop)", (f) => {
  expect(ALLOWED_PROFILE_FIELDS).toContain(f);                  // else updateFields drops it silently
  expect(Object.keys(profileUpdateSchema.shape)).toContain(f);  // else validation strips it
});
```

Per-step validation gating (step e/f advancement) is covered by e2e scenarios in §10.5 so a blocked `Next` is proven, not assumed.

### 3. Integration layer — the seams

`src/components/__tests__/welcome-gate.integration.test.tsx` renders the real `ProtectedRoute` + gate wrapper inside `MemoryRouter`, with `useAuth` mocked to supply `{ profile, profileLoaded, refreshProfile }`. Proves the wiring the unit test can't:

- An authenticated user with `welcome_flow_completed_at === null` hitting **any** protected path renders `<Navigate to="/welcome">`, not the page.
- **Sequencing:** the gate runs *after* `MfaEnforcementGuard` (`src/components/MfaEnforcementGuard.tsx`) — assert MFA redirect wins when both are pending (security first).
- **Coordination:** `AuthRedirectHandler` (`src/components/AuthRedirectHandler.tsx`) does not send a mid-flow user to `/dashboard` — the gate's `/welcome` redirect wins over the landing decision.
- `profileLoaded=false` renders the spinner, **not** a redirect (prevents a flicker-redirect on every hard refresh).
- Step→profile cache: completing step-f calls `ProfileService.update`, and `EditProfilePage`'s reader (same React-Query key) reflects it **from one cache**, proving the "never a second copy kept in sync" rule (`decisions.md` one-owner-per-fact).

### 4. Contract layer — the EO boundary (has a defect to catch)

**⚠️ Verified defect the contract test must fail on today.** `set_my_marketing_subscription(p_subscribed, p_source)` validates `p_source IN ('signup','profile')` and **silently coerces anything else to `'profile'`** (`supabase/migrations/20260822120000_email_octopus_sync.sql:87-88`). The brief specifies `p_source="welcome_flow"`, which would be **swallowed** — telemetry would misattribute every welcome-flow opt-in as `'profile'`. The provider Deno contract test must assert the allowed set, and the fix (expand the `IN` list additively — expand/contract) must land before the consumer sends `'welcome_flow'`.

`supabase/functions/eo-contact-status/eo-contact-status.test.ts` (provider read shape) + `src/services/__tests__/marketing-subscription.contract.test.ts` (consumer shape):

```gherkin
# provider contract — the RPC's accepted p_source set is part of its contract
Scenario: set_my_marketing_subscription rejects an unknown source instead of silently coercing
  Given the welcome flow calls the RPC with p_source "welcome_flow"
  Then "welcome_flow" is an accepted value AND is recorded as-is in telemetry
  # RED until migration expands the IN ('signup','profile','welcome_flow') allow-list
```

- **Consumer side:** the welcome-flow newsletter step calls **only** `set_my_marketing_subscription` / `get_my_marketing_subscription` via `invokeEdge`/RPC — never writes marketing state onto `profiles` (ADR-0017). Assert no `profiles` marketing column is touched.
- **Default-OFF / opt-in-only:** assert the RPC is called (enqueue) **only** when the toggle is ON; an untouched OFF toggle makes **zero** EO calls.
- **Display read:** the toggle's checked state derives from `get_my_marketing_subscription()`, not local component state (EO is source of truth).
- **Override-email:** `get_my_marketing_subscription`, `eo-contact-status`, and the DSAR before-delete erasure trigger all key off `profiles.email` — the override needs a **new** account-email→marketing-email mapping with its **own** read + **own** erasure path. Contract test asserts the new mapping has a DSAR deletion test (compliance) before ship.

### 5. E2E layer — Playwright (`e2e/welcome-flow/`)

Match the repo's session-bootstrap pattern from `e2e/profile-setup.e2e.ts`: API `signInWithPassword` through a **capturing storage** to replay the exact `localStorage` session before the app boots (avoids Turnstile), gated on backend env, **skips cleanly when unavailable**. Seed a fresh user with `welcome_flow_completed_at = null`.

```gherkin
Feature: Welcome Flow is mandatory and shown exactly once

  @smoke
  Scenario: First-time member completes the full 7-step flow
    Given a signed-in member who has never completed the welcome flow
    When they sign in
    Then they land on "/welcome" (not "/dashboard")
    And they progress a → g and press "Finish onboarding"
    Then "welcome_flow_completed_at" is set on their profile
    And a "Welcome" card appears in the dashboard "Get started" section

  Scenario Outline: The flow cannot be skipped from ANY protected route or deep link
    Given a signed-in member with welcome_flow_completed_at = null
    When they navigate directly to "<path>"
    Then they are redirected to "/welcome"

    Examples:
      | path             |
      | /dashboard       |
      | /courses         |
      | /project-openings|
      | /profile/edit    |
      | /courses/onboarding |

  Scenario: Complete-once survives a fresh session
    Given a member who finished the welcome flow
    When they sign out and sign back in (new browser context)
    Then they land on "/dashboard" and the flow is never shown again

  Scenario: Lockout-safety — a failing profile fetch does not trap AND does not bypass
    Given the profile fetch is forced to error (route intercept → 500)
    When the member is on any protected route
    Then a retry/error state is shown
    And protected page content is NOT rendered
    And they are NOT redirected in a loop to /welcome
```

```gherkin
Feature: Step-g CTAs and step-f profile bidirectional sync
  # Step (d) goal toggles + d1/d2 conditional CTAs are REMOVED (P9) — no scenarios for them.

  Scenario: Step-g shows only the fixed CTAs (no selection-driven routing)
    Given a member on the final step
    Then the fixed CTAs are shown (Take me home, Join Discord, Finish onboarding), stacked vertically, same style
    And no "Project openings" / "Courses" conditional CTA appears

  Scenario: Basic-Information round-trips between the flow and Edit Profile (one owner)
    Given a member sets "Last Name" to "Denner" on step (f) of the welcome flow
    When they open Edit Profile, Basic Information
    Then "Last Name" shows "Denner"
    When they change it there and save, then re-enter the welcome flow
    Then step (f) shows the updated value   # one owner (ProfileService), one cache — no divergence
```

```gherkin
Feature: Newsletter step

  Scenario: Newsletter defaults OFF and only enqueues on opt-in
    Given a first-time member reaches the newsletter step
    Then the toggle is OFF and the email field is prefilled with their signup email
    When they leave it OFF and continue
    Then no Email Octopus subscribe is enqueued

  Scenario: Opt-in with an overridden mailing-list email
    Given the member turns the newsletter ON
    And overrides the mailing-list email with "me+news@example.com"
    Then the override is validated server-side
    And the subscription is created for the overridden email, source "welcome_flow"

  @security
  Scenario: Override email rejects header injection
    When the member enters "x@y.com\nBcc:evil@z.com" as the mailing-list email
    Then the value is rejected before any EO call
```

```gherkin
Feature: Per-step validation gates advancement

  Scenario: Next is blocked when a step-f field is invalid
    Given a member on step (f) enters "not-a-url" in Portfolio URL
    When they press "Next"
    Then advancement is blocked and the field shows a linked, text error
    And no ProfileService.update is issued for the invalid value

  Scenario Outline: Step-f boundary inputs
    Given a member on step (f) sets "<field>" to "<value>"
    Then it is "<outcome>" and the flow state stays consistent
    Examples:
      | field        | value              | outcome             |
      | first_name   | (257-char string)  | rejected            |
      | linkedin_url | https://ok.example | accepted            |
      | first_name   | (empty)            | accepted (optional) |

  Scenario: Next is blocked when the override email is invalid
    Given the newsletter is ON and the override email contains CR/LF control characters
    When they press "Next"
    Then advancement is blocked, the value is rejected before any EO call, and the error is announced
```

### 6. bdd-gate.yml satisfaction — exact test files per changed module

`bdd-gate.yml` fails the PR unless **every** changed `src/pages/**`, `src/services/**`, and `supabase/functions/**` module is *referenced by path* in a test under `src/test/`, `e2e/`, or (edge fns) a co-located `*.test.ts`. The check greps for the full module path `src/pages/<dir>` or the basename (≥6 chars). Each new module below is paired with a test that **names its path in a string** so the grep hits:

| Changed module (triggers gate) | Test file that references it (satisfies gate) |
|---|---|
| `src/pages/WelcomePage.tsx` (or `src/pages/welcome-flow/`) | `e2e/welcome-flow/welcome-flow.e2e.ts` + `src/test/pages/welcome-page.test.tsx` |
| `src/services/profile.service.ts` (modified) | `src/services/__tests__/profile.service.welcome.test.ts` |
| `src/pages/TrainingPage.tsx` (changed — Courses first-tab/first-card entry + live completion stat, §4.11) | `src/test/pages/training-welcome-entry.test.tsx` (first-card placement, completed marker, replay routes to `/welcome`) + `e2e/welcome-flow/courses-entry.e2e.ts` + `src/test/services/welcome-completion-count.test.ts` (**live-stat-not-counter**: asserts the RPC equals `count(*)` and no counter table exists) |
| `src/pages/DashboardPage.tsx` (changed — Welcome card in Get Started) | `src/test/pages/dashboard-welcome-card.test.tsx` (also asserts the card is ABSENT in `TrainingPage`) |
| `src/pages/EditProfilePage.tsx` (changed — step-f Basic-Information fields; bidirectional with the flow) | `src/components/__tests__/welcome-gate.integration.test.tsx` (one-cache round-trip, §10.3) |
| `supabase/migrations/*` (new column) | covered by `migration-smoke` + `db-schema-gate` (not bdd-gate) |

> **Gotcha to honor:** the gate's basename fallback only fires for names ≥6 chars. `WelcomePage`/`welcome-flow`/`profile.service` all clear it. But if the flow page is named `Welcome.tsx` the basename `Welcome` (7) is fine — avoid a `<6` char page filename. **Put the literal module path in a comment or import string** in the test so the grep matches even before the UI assertions do:

```ts
// e2e/welcome-flow/welcome-flow.e2e.ts
// Covers: src/pages/WelcomePage.tsx, src/services/welcome-flow.service.ts  ← bdd-gate path anchors
```

Edge-function note: this feature adds **no new edge function** (it reuses `set_my_marketing_subscription` RPC + existing `eo-contact-status`). If the override-email ADR introduces one, it needs a co-located `supabase/functions/<name>/<name>.test.ts` (Deno) — the only tests the `deno-check` job and bdd-gate's `--include='*.test.ts'` branch can see.

### 7. Coverage & mutation gate targets

| Gate | Target | How enforced |
|---|---|---|
| **Line/branch coverage on changed files (MANDATORY — not optional)** | ≥ 90% lines, ≥ 85% branches on `src/hooks/use-welcome-gate.ts`, the welcome paths of `src/services/profile.service.ts`, and the completion-count read hook (§6.13) | Add `@vitest/coverage-v8` (dev dep — not installed today) **and a scoped CI lane** (`vitest run --coverage --coverage.include=… --coverage.thresholds.lines=90 --coverage.thresholds.branches=85`). A 767-user, un-skippable lockout gate does **not** ship with coverage enforcement optional. |
| **Decision-logic branch coverage** | 100% of `welcomeGateDecision` branches (every union arm) | exhaustive unit cases (§2D); fail the build below 100% |
| **Mutation on the 2 critical pure modules** | Stryker over `src/hooks/use-welcome-gate.ts` + `src/lib/welcome-flow-goals.ts` (break ≥ 85) | `welcomeGateDecision` is THE lockout logic; a flipped `== null` / branch-order is the mutant that must not survive — scoped Stryker on two tiny files *proves* the exhaustive tables instead of asserting them. *If Stryker is refused, the doc must instead prove 100% branch coverage AND state that assertion-discipline review substitutes for mutation on these files.* |
| **Property-based fuzz on the override-email validator (PR5)** | `fast-check`: never accepts CR/LF/control chars; accepted output is RFC-shaped + idempotent under re-validation | infinite input space on a security-critical validator — the hand-picked table (§2E) is not sufficient; keep the exhaustive table for the closed option-map |
| **Mutation (guards)** | the new arch-gate ESLint rule (ban `@/components/ui` + `lucide-react` in the welcome dir) must survive `verify-guard-test-discrimination.mjs` (`ci.yml:225`) | its guard test must FAIL when the rule is no-op'd |
| **No assertion-free tests** | every unit `it` asserts an observable (payload shape, route, decision arm), never just "resolves" | code-review + the negative example in §2A |

Coverage is **necessary, not sufficient** — the exhaustive option-map and gate-decision tables are the real quality signal; a high % with weak asserts is worthless (the setup-file supabase stub resolves everything to `{data:[]}`, so a test that doesn't assert the *payload* passes vacuously).

### 8. Flaky-test guardrails

- **Vitest: jsdom + no live Supabase, ever.** `check-no-prod-supabase-in-tests.mjs` (roots `src`, `e2e`) hard-fails on the prod ref `pzvqxdgoztbfikfuifix`. Unit/integration tests **must** `vi.mock("@/integrations/supabase/client")` (overriding the `src/test/setup.ts:38` stub) — never hit a network. gate-test runs with **no** `VITE_SUPABASE_URL` by design.

```ts
// ❌ never — a gate test that constructs a real client (throws "supabaseUrl is required" in gate-test, or worse, hits prod)
const sb = createClient(process.env.VITE_SUPABASE_URL!, key);

// ✅ always — override the setup-file stub with a purpose-built mock
vi.mock("@/integrations/supabase/client", () => ({ supabase: makeMockClient() }));
```

- **Playwright vs. local Supabase.** E2E that needs a real session follows `e2e/profile-setup.e2e.ts`: env-gated, **skips** (not fails) when `VITE_SUPABASE_URL`/anon key are absent, and bootstraps via API sign-in through capturing storage to dodge the live-Turnstile flake. Default project is `chromium-desktop` only (`playwright.config.ts:121`) for the PR gate; the full device matrix is opt-in.
- **Deterministic time.** The completion writer stamps a timestamp — freeze the clock (`vi.setSystemTime`) in the unit test so the asserted ISO value is stable.
- **No `networkidle` waits** — `check-no-unguarded-networkidle.mjs` (`ci.yml:164`) blocks them; wait on the DOM (`getByRole(...).waitFor()`), as the existing e2e suites do.
- **Un-skippable enforcement uses Playwright route intercept for the fault-injection scenario** (force the profile fetch to 500) — deterministic, no real backend failure needed.
- **Quarantine policy:** any welcome-flow e2e that flakes twice is tagged and fixed before merge — never left on `retries` to paper over. The auth suite's `retries:1` is a live-Turnstile concession; the welcome-flow suite bootstraps via API and should be retry-0-clean.

### 9. Acceptance-criterion → test traceability

Every acceptance criterion in §4 maps to ≥1 test, keyed to the **actual `AC-*` identifiers** — the earlier `AC1–AC23` scheme was mis-keyed and silently omitted real ACs (notably AC-N3 autosave, AC-f3 field-contract, AC-g3 finish-before-nav, AC-CARD-3). Corrected and completed here. `U`=unit, `I`=integration, `C`=contract, `E`=e2e, `P`=pgTAP.

| AC (§4) | Criterion (abbrev) | Test(s) |
|---|---|---|
| AC-G1 | Null flag ⇒ redirect to `/welcome` | U(§2D redirect arm) + I(redirect when null) + E(outline) |
| AC-G2 | No control reaches a gated route while incomplete | E(Scenario Outline: every path/deep-link) |
| AC-G3 | After completion, never redirected (fresh session/device) | E("Complete-once survives a fresh session") |
| AC-G4 | Fetch fail ⇒ retry, no trap, no bypass | U(§2D `error-retry`) + E(route-intercept 500) |
| AC-G5 | Sequenced after MFA; wins over `/dashboard` landing | I(MFA sequencing + AuthRedirectHandler) |
| AC-N1 | Order + 100dvh single column | E(layout assert) + axe/reflow sweep (§12.10 `/welcome`) |
| AC-N2 | No Skip/close affordance anywhere | E("cannot be skipped") + §13 "no Skip control" |
| AC-N3 | Refresh mid-flow restores step + values (autosave) | E("No data loss on refresh", §12.11) + I(resume = `min(savedStep, firstIncomplete)`) |
| AC-a1 / AC-b1 / AC-c1 | Steps a/b/c render; write NOTHING | U(step components call no service on mount — assert `ProfileService` NOT called) |
| ~~AC-d1…AC-d4~~ | **REMOVED (P9)** — step (d) and the goals column are out of scope; no tests | — |
| AC-e1 | Newsletter OFF default; off ⇒ no EO contact | C(default-off ⇒ zero EO calls) + E |
| AC-e2 | Opt-in matches Notification Settings surface | C(`get_my_marketing_subscription` display read) |
| AC-e3 | Email field prefilled with signup email | U(prefill) + E |
| AC-e4 | Override validated, own owner, erased on deletion | U(§2E validator) + C(mapping + DSAR) + P(erasure) + E(@security) |
| AC-f1 | Each field persists to existing Basic-Info column | U(§2A `updateFields`) + E |
| AC-f2 | Step-f bidirectional sync | I(one-cache) + E |
| AC-f3 | Every field in BOTH zod schema AND allow-list (no silent drop) | **U(new guard test, §2F)** |
| AC-f4 | Existing member sees Basic-Info pre-filled (Redundant Entry, 3.3.7) | I(render step-f with a seeded profile) + E |
| AC-g1 | Three base CTAs route correctly; stacked | E + U(always-on set) |
| AC-g2 | *(REMOVED — no conditional CTAs; step (d) gone, P9)* | — |
| AC-g3 | Completion confirmed BEFORE nav; fail ⇒ retry not loop | U(§2A throws on error) + E(finish-write-fails keeps user on step) |
| AC-CARD-1 | Card in Get Started, marked complete | E(dashboard card) |
| AC-CARD-2 | Card never in Courses listing | E + U/I(absent in `TrainingPage`) |
| AC-CARD-3 | Card state driven by server flag (toggled) | I(render card with flag set vs null → completed vs incomplete) |
| AC-CO1 | Welcome Flow = first card, first Courses tab, all roles, standard style; reachable when Get Started is done | U/I(first-card placement in `TrainingPage`) + E(`courses-entry.e2e.ts`) |
| AC-CO2 | Courses entry shows completed state from the server flag | I(render entry with flag set vs null) |
| AC-CO3 | Completed member replays from Courses; `welcome_flow_completed_at` unchanged; not re-gated | E(replay-idempotency: timestamp stable, no redirect) + U(set-once `COALESCE`) |
| AC-CO4 | Completion count live-derived, excludes test accounts, no increase on replay | **U(`live-stat-not-counter`: RPC == `count(*)`, no counter table)** + I(count stable across a replay) |

**Enforcement is executable, not documentary:** every `@security` / `@reliability` / `@compliance` / `@release-safety` scenario in §7–§11 is realized as a *named* Playwright / Vitest / pgTAP test (this repo has no Cucumber runner), listed either in the rows above or in §10.2–§10.5 — so no scenario is orphaned documentation.

---

## 11. Release & Rollout

Discipline: `release-deployment-safety`. This section governs *how* the Welcome Flow reaches the ~767 real users without a seam anyone can feel. Every change below is **independently deployable, backward-compatible during a mixed old/new rollout, observable while ramping, and reversible in minutes** — and where any of those four is not yet true, it is listed in *Must fix before build*.

The one fact that shapes everything here: **this repo runs two independent deploy pipelines that both fire on merge to `main` and are not ordered relative to each other** — `deploy-migrations.yml` (auto-applies SQL, ADR-0045) and `deploy-frontend.yml` (builds + promotes the bundle to 100% traffic). A single PR that touches both `supabase/migrations/**` and `src/**` triggers both workflows in parallel, and the migration can apply before *or after* the new bundle is serving. A mandatory redirect gate on top of that race is how you turn a feature into an outage. The sequencing below exists to make that impossible.

### 1. Change classification → strategy

| Change | Class | Safe path |
|---|---|---|
| `welcome_flow_completed_at` column on `profiles` (one column only — no goals column, P9) | Additive schema | Expand-only migration; auto-applies on merge (ADR-0045); inert until code reads it (two-merge expand-first) |
| The mandatory redirect gate + flow UI | User-visible, high-blast-radius behavior (redirects ~50 routes) | **Flagless 100% at merge (§11.2)** — no flag, no canary; the gate PR (PR5) merges **last**, only once the whole flow is built; recovery = frontend bundle revert (minutes) |
| Newsletter opt-in (step e) | Behavior reusing an existing fail-open RPC | Ships un-gated behind the flow screens (PR3), inert until the gate PR routes users to `/welcome`; no new rollout surface |
| Marketing-email override (step e override) | New owned table + new DSAR erasure path | Separate expand migration + **its own ADR**; own PR (PR6 fast-follow) |
| Retiring `WelcomeWizard` / `WelcomeDialog` / `ProfileSetupDialog` | Code contract (deletion) | **Contract PR after GA**, only after the new flow is live and stable |

There is **no new service, no new endpoint, and no breaking API change** — the flow rides existing seams (`ProfileService`, `set_my_marketing_subscription`) plus one new read RPC for the Courses completion-count stat (§6.13). That keeps the rollout surface small, which is the point.

### 2. Flagless 100% launch — the decision, the accepted risk, and the controls

**Product decision (2026-10-09): ship the Welcome Flow to 100% of users at merge, with NO feature flag and NO canary** — chosen over the recommended emergency kill switch. This section records the resulting risk posture honestly (release-deployment-safety); it **supersedes any residual flag/canary phrasing elsewhere in this doc.**

The flow is *mandatory*: the route guard redirects every authenticated route to `/welcome` until `welcome_flow_completed_at` is set, for all members/teachers/admins. With no flag, the gate arms purely on `authenticated + welcome_flow_completed_at IS NULL`, and it is **live the instant the gate code is in the serving bundle** — there is no dark-launch and no off-switch.

```ts
// ✅ flagless — the gate arms on the completion flag alone; the three-state contract is the ONLY
//    safety (there is no flag branch to disarm). The /welcome route renders whenever reached.
function welcomeGateDecision({ profileLoaded, profile, fetchError, pathname }) {
  if (!profileLoaded)                 return { kind: "wait" };         // spinner, never redirect blind
  if (fetchError || profile === null) return { kind: "error-retry" };  // retry, never trap, never bypass
  if (isAllowlisted(pathname))        return { kind: "allow" };        // /welcome + every sign-out path
  return profile.welcome_flow_completed_at
    ? { kind: "allow" }
    : { kind: "redirect", to: "/welcome" };
}
```

**Recovery = frontend revert (no instant kill).** If the gate misbehaves in prod there is no ≤60s flag flip. Recovery is: promote the previous Cloudflare Pages bundle (`wrangler versions deploy <prev-id>@100%`) or revert the commit → rebuild — **on the order of minutes**, during which the whole userbase is affected. The additive column stays (harmless, forward-only); never roll back the migration.

**Residual risk ACCEPTED (product chose flagless over the recommended kill switch).** A gate defect at launch = a full-userbase lockout until the revert ships. With the flag safety net gone, these compensating controls are **mandatory, not optional**:

1. **The lockout-safety `@reliability` tests are a hard merge-blocker** — loading-spinner, error-with-retry (no trap), and no-bypass must all pass in CI before the gate PR merges (§9.8, §10). This is the primary defense now that the flag is gone.
2. **Fail-safe three-state gate** (above): unknown / read-failed → retry, never trap, never bypass. A flaked profile read must never lock anyone out.
3. **The gate merges LAST, only once the full flow is complete.** With no flag to dark-launch behind, merging the gate before the step screens exist would drop every user into a half-built flow. So the gate PR — the thing that *forces* users in — is the final merge, after steps a–g + the completion write are built and tested behind the still-un-gated `/welcome` route.
4. **Fast-revert runbook + a named launch owner on-call** for the first 72 h (§9.6, §9.9): the first mitigation is **revert the deploy**, decided and rehearsed before launch.
5. **Cutover capacity pre-checked** (§3 NFR, §9.7): with no ramp to spread it, every incomplete user hits the gate + one completion write on their next login. Confirm the natural peak-logins/min completion-write load stays within the prod PgBouncer connection limit **before** launch.
6. **Break-glass `ProfileService.resetWelcomeFlow`** (admin-only, single-user, audited — §7.7) to un-complete a member who finished in a bad state. (Completion is otherwise irreversible by design.)

### 3. Expand/contract under auto-apply-on-merge (the two-pipeline race)

`deploy-migrations.yml` fires on push to `main` under `supabase/migrations/**` (`:30-34`), is concurrency-serialized (`:47-49`), dry-runs then `supabase db push` (`:120-132`). `deploy-frontend.yml` fires on push to `main` with `paths-ignore: supabase/**, docs/**, **/*.md` (`:21-27`) and promotes the new bundle to 100% traffic (`:76-96`). **A PR that changes both a migration and `profile.service.ts` triggers both, in parallel, with no ordering guarantee.**

The additive column is safe the moment it exists; old running code ignores it because PostgREST returns only the columns the explicit select names, and `ProfileService.fetch()`'s allow-list simply won't name it yet. **The only failure window is new code selecting a column that does not exist yet** — if the promoted bundle serves a `ProfileService.fetch()` that selects `welcome_flow_completed_at` before the migration applies, PostgREST errors, the profile fetch fails, and the gate's error path trips for real users.

```text
❌ never — migration + the fetch-select change in ONE merge.
   push to main ─┬─ deploy-migrations  (applies column)      ─┐ race, no ordering
                 └─ deploy-frontend    (serves code selecting it) ┘
   If frontend wins the race: SELECT welcome_flow_completed_at → column does not exist → profile fetch 400.

✅ always — expand-first as TWO merges (expand/contract discipline, ADR-0026):
   Merge A: migration ONLY (touches only supabase/migrations/**).
            → only deploy-migrations runs; NO new bundle; nothing selects the column.
            → confirm applied: db-schema-gate GREEN on main + `supabase db push --dry-run` == "no pending".
   Merge B: add the column to ProfileService.fetch's explicit select + markWelcomeFlowComplete + constants.
            → column already exists in prod; new bundle selecting it is safe; old cached bundle never selected it.
```

The expand migration itself — additive only, idempotent, and (flagless) it changes nothing at runtime until the fetch-select + gate code ship:

```sql
-- ✅ expand: nullable, idempotent, additive. profiles is ROW-scoped RLS
-- (auth.uid() = user_id) — NOT column-scoped like public.projects (ADR-0056),
-- so NO per-column GRANT is needed here (contrast supabase/migrations/CLAUDE.md).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_flow_completed_at timestamptz;   -- NULL = everyone gets it once
-- (welcome_flow_goals column REMOVED — step (d) is out of scope, P9.)

-- (No feature-flag seed — flagless 100% launch, §11.2. The migration adds only the column + RPC;
--  nothing is "armed" until the gate code ships, and the gate arms on welcome_flow_completed_at alone.)

-- ❌ never in an expand PR: DROP/RENAME a column, add NOT NULL without default+backfill,
--    or CREATE OR REPLACE a function with a changed signature. Those are CONTRACT (a later PR).
```

`welcome_flow_completed_at` stays nullable forever: NULL is a load-bearing value (= "hasn't done it"), so there is no later "tighten to NOT NULL" contraction. (The step-d goals column is removed — P9 — so this feature adds no `text[] NOT NULL DEFAULT '{}'` column.)

### 4. Backward-compatibility rules (non-negotiable)

- [ ] **No drop / rename / NOT-NULL-in-place** in any expand PR. Old and new bundles coexist at the edge during a promotion; both must work.
- [ ] **Old code tolerates the new columns** — guaranteed by PostgREST explicit-select allow-lists; verify the old `ProfileService.fetch()` select does **not** name the new columns until Merge B.
- [ ] **New code tolerates a not-yet-applied migration only because we forbid that ordering** (§3): the column exists before any bundle selects it.
- [ ] **Newsletter reuses the existing `set_my_marketing_subscription(p_subscribed, p_source)` RPC** with `p_source='welcome_flow'`; no new marketing state on `profiles` (ADR-0017). No compatibility break because no contract changes.
- [ ] **Contract is a separate, later PR** — retiring `WelcomeWizard`/`WelcomeDialog`/`ProfileSetupDialog` and the dead paths lands only after the new flow is live and stable. Never in the same release as expand.
- [ ] **Blast-radius & SPA mixed-version model (flagless).** `deploy-frontend` promotes every merged bundle to **100% of traffic at merge** — and with no flag, *every* PR's code reaches 100% of users the moment it is in the serving bundle. This is exactly why the flow is built across PR1–PR4 **before** the gate ships: PR2–PR4 add the flow screens, service writes, Courses entry, and the `ProfileService.fetch()` select-string, but none of them route anyone to `/welcome` — the flow is reachable only via Courses (opt-in) until **PR5 (the gate) merges last and makes it mandatory** (§11.2, §16). Keep each pre-gate PR's user-visible surface minimal and test-gated (the select-string unit test), and remember that after a 100% promotion clients keep their already-loaded bundle for the life of the tab/session (hours–days) — so **no Contract PR (legacy removal) may assume all clients run the latest bundle.**

### 5. PR / phase breakdown — flagless; the gate PR merges last

The canonical PR breakdown is **§16** (the 7-PR flagless plan — PR0 enablers, PR1 migration + completion-count read RPC, PR2 gate shell + flow screens *not yet routed*, PR3 steps e/f, PR4 Courses entry + stat + dashboard card + legacy retire, **PR5 the gate = the launch**, PR6 override-email fast-follow). This section records only the *release-safety* properties of that plan; §16 owns the scope detail (single source — do not re-list scope here and let it drift).

Every PR must pass the required **`ci / gate`** aggregator (`.github/workflows/ci.yml:352-410`) and — on migration PRs — the blocking `migration-smoke` (fresh `supabase db reset`, `:522-567`) and `db-schema-gate` (ADR-0036, `:586-605`), plus `npm run check:architecture` exit 0 (`arch-gate`, `:346`) and a `judge-arch` PASS.

Release-safety invariants that hold across the plan:

- **No flag, so no "flag state on merge" column** — safety comes from *ordering*, not a switch. The flow is fully built and reachable only via Courses (opt-in) across PR1–PR4; **PR5 (the gate) merges last and is the launch** — on that merge the flow becomes mandatory for every incomplete user on their next login (§11.2).
- **PR1 (migration) and the PR2 fetch-select are split expand-first** (§3): the column is merged and *confirmed applied on `main`* (db-schema-gate green, `db push --dry-run` == "no pending") before any bundle selects it.
- **Every pre-gate PR's rollback is a plain bundle revert** (minutes) with zero user-facing effect, because nothing routes to `/welcome` until PR5. **PR5's rollback is the §11.6 fast-revert** — the one lockout-sensitive step.
- **PR6 (override-email) repeats the expand-first split** for its new owned table (migration-smoke, db-schema-gate, erasure-completeness guard).

### 6. Rollback — decided before deploy (flagless: frontend revert, no instant kill)

| Failure | Action | Time | Safe? |
|---|---|---|---|
| Gate misbehaves / lockout reports (post-PR5) | **Promote the previous Cloudflare Pages bundle** (`wrangler versions deploy <prev-id>@100%`) or revert the gate commit → `deploy-frontend` rebuilds | **minutes** (no ≤60s flag flip — accepted residual risk, §11.2) | Yes — additive column stays inert; no schema depends on the new bundle |
| Bad frontend bundle (any pre-gate PR) | Same bundle revert; **zero user-facing impact** because nothing routes to `/welcome` yet | < 5 min | Yes |
| Bad migration | **Do not roll back the migration** — forward-only. Column stays nullable; fix forward | n/a | Yes — expand-only means nothing is destroyed |
| A single user completed in a bad state | Break-glass `ProfileService.resetWelcomeFlow(userId)` (admin, single-user, audited — §7.7) | Minutes | Yes |

The expand-only discipline is what makes rollback safe at every step: we never destroy the thing running code depends on, so reverting code never lands on a missing column. **The flagless trade-off (§11.2) is explicit:** there is no instant kill; the primary defenses are the lockout-safety merge-gate (§9.8/§10), the fail-safe three-state gate, and a named on-call owner ready to execute the revert fast (§9.9).

### 7. Deploy ordering & verification

Pre-merge (blocking, `ci / gate`):
- **`migration-smoke`** — `supabase db reset --no-seed` applies the full history from scratch on fresh Postgres (`ci.yml:522-567`). Proves the expand migration applies cleanly and is idempotent.
- **`db-schema-gate`** — ADR-0036 reconciliation: every declared object must exist in prod (`ci.yml:586-605`). On a PR it catches a cross-PR collision; on `main` it is the post-apply proof the column landed.
- **`check-migration-version-collision.mjs`** (`ci.yml:181-184`) — the migration timestamp prefix must be unique and later than `20260926120000` *and* any prefix on a parallel branch.
- **ADR IDs — date-prefix convention (no numbers to reconcile).** Per the repo convention (PR #414, `docs/adr/README.md`), new ADRs are `YYYYMMDD-slug.md`, so collisions are structurally impossible and there is **no "next free number" to verify.** This feature's three ADRs are `20261009-welcome-flow-gate`, `20261009-welcome-flow-data-model`, `20261009-welcome-flow-eo-extension` (they share the date; unique by filename). The date-aware `check-adr-number-collision.mjs` accepts them; reference legacy ADRs as `ADR-NNNN`.

On merge:
- **`deploy-migrations.yml`** dry-runs then pushes only unseen migrations in version order (`:120-132`), serialized (`:47-49`). Its one-time prereqs must be live: `SUPABASE_DB_PASSWORD` secret + a bootstrapped ledger (ADR-0045) — **if those are not active, the migration silently will not apply** and PR2's code breaks. Verify on `main` with `supabase db push --dry-run` == "no pending".
- **`deploy-frontend.yml`** builds, promotes to 100% (defeats gradual-deploy 0% parking, `:76-96`), and verifies prod serves this commit via a cache-proof `/deploys/<sha>.txt` marker (`:98-121`). A failed deploy is a red check, not a silent stale bundle.

Out-of-band: `config-preflight.yml` sweeps prod schema drift daily (belt-and-suspenders on `db-schema-gate`).

### 8. `@release-safety` BDD scenarios (realized as executing e2e / gate tests — enforcement per §7.6)

```gherkin
  @release-safety
  Scenario: Reverting the gate bundle disarms the mandatory gate (flagless rollback)
    Given the gate bundle is live and an authenticated user has not completed the Welcome Flow
    When the previous bundle (without the gate) is promoted to 100 percent
    Then on the user's next load they are no longer redirected to /welcome
    And the welcome_flow_completed_at column is left untouched for a later re-launch

  @release-safety
  Scenario: A pre-gate bundle never routes anyone to the flow
    Given PR1 through PR4 are merged but the gate PR (PR5) is not
    When an authenticated incomplete user signs in
    Then they land normally and are never redirected to /welcome
    And the Welcome Flow is reachable only via the Courses entry card

  @release-safety
  Scenario: Old bundle tolerates the newly added profiles column
    Given the expand migration has added welcome_flow_completed_at
    When the previously deployed bundle reads and updates a profile via ProfileService.fetch
    Then it succeeds and never selects the new column

  @release-safety
  Scenario: The completion-count stat is live-derived, never a stored counter
    Given N users have welcome_flow_completed_at set
    When the Courses completion-count stat renders
    Then it reflects count(*) over profiles via the get_* read RPC (§6.13)
    And no stored or incremented counter column exists to drift

  @release-safety
  Scenario: Completed users never re-enter the mandatory gate
    Given user U has completed the Welcome Flow
    When U signs in after the gate PR is live
    Then U is not redirected to /welcome and sees the Get Started completion card
```

### 9. Definition of Done — release addendum (extends `CLAUDE.md`)

- [ ] Root cause + layer named; repro failed-before/passes-after; `npm run test`, typecheck, lint green (CLAUDE.md DoD).
- [ ] `npm run check:architecture` exits 0 **and** `judge-arch` PASS (blocking arch gate).
- [ ] `ci / gate` green; on migration PRs `migration-smoke` + `db-schema-gate` green.
- [ ] **Flagless launch sequencing verified (§11.2/§16):** the flow is fully built and reachable only via Courses across PR1–PR4; the gate PR (PR5) merges **last** and IS the launch; fast-revert runbook + named on-call owner in place.
- [ ] Expand-first split verified: migration merged and confirmed applied (db-schema-gate green on main, dry-run "no pending") **before** any bundle selects the new column.
- [ ] Rollback rehearsed: frontend bundle revert disarms the gate (minutes, measured); no migration is rolled back; break-glass single-user reset exists.
- [ ] Contract (legacy retirement + dead-path removal) filed as a **follow-up PR**, scheduled after the flow is live and stable — not merged with expand or with the gate.
- [ ] **Three** ADRs written and committed (`20261009-welcome-flow-gate`, `20261009-welcome-flow-data-model`, `20261009-welcome-flow-eo-extension`) alongside the code — date-prefix IDs, no numbers to reconcile.

---

## 12. Accessibility, UX & Cross-Platform

**Disciplines applied:** `universal-accessibility-wcag` (**WCAG 2.2 Level AAA is the target — P4, confirmed**; AA is the floor), `usability-ux-universal-design`, `universal-browser-device-support`. *AAA is pursued in full; where a specific AAA success criterion is genuinely not achievable for a control, record the exception + its AA fallback in the §12.11 checklist — never silently drop it. Two AAA gaps the current DS creates are flagged in §12.8 (brand-blue contrast; 40px button height).*

**Conformance bar is already enforced, not aspirational.** The repo runs axe-core over every route in `e2e/a11y/wcag-audit.e2e.ts:247` with tags `wcag2a…wcag22aa` + AAA + best-practice (`e2e/a11y/wcag-audit.e2e.ts:56`), and `e2e/a11y/enforce-baseline.mjs:76` **fails the PR on any new axe violation** and on **any non-`manual` checklist item in `fail`/`needs_review`** (`enforce-baseline.mjs:85`). The Welcome Flow inherits that gate the moment `/welcome` is added to `e2e/a11y/routes.ts` — so this section is a build contract, not advice.

---

### 1. The mandatory-flow contract: un-skippable ≠ keyboard-trapped

This is the single highest-risk a11y requirement. "Cannot leave the flow" is an **application routing** constraint. "Cannot move keyboard focus off a control" is **WCAG 2.1.2 No Keyboard Trap (A)** — a hard failure. They are unrelated, and conflating them locks out every keyboard and screen-reader user.

Rules, as concrete patterns:

```tsx
// ❌ never — trapping the whole app in an aria-modal to "force" completion.
// aria-modal hides all sibling content from AT and implies a dismiss affordance
// that doesn't exist; focus-trapping a route that has no "outside" is nonsense.
<div role="dialog" aria-modal="true"> {/* wraps <App/> */}
  <WelcomeFlow />
</div>

// ✅ always — the flow is a normal routed PAGE with landmarks and one h1 per step.
// The GATE lives in the route guard (see Architecture §2), not in a focus trap.
<main id="welcome-main" aria-labelledby="welcome-step-heading">
  <h1 id="welcome-step-heading">{step.title}</h1>
  {/* every control here is reachable AND escapable by Tab/Shift+Tab */}
</main>
```

- **2.1.2 No Keyboard Trap:** from any control the user can Tab forward and Shift+Tab backward through *all* controls on the step and always reach **Next / Back / Finish**. Focus is never stuck inside a sub-widget (toggle group, text field).
- **The one allowed "exit":** sign-out must stay keyboard-reachable on every step, matching the guard's allowlist (Architecture §2). A user who cannot complete the flow must still be able to log out — never a dead end.
- **Not a dialog:** no `role="dialog"`, no `aria-modal`, no global focus trap. It is `<main>` with a visible, programmatic `<h1>` per step (**2.4.6 Headings and Labels**, **1.3.1 Info and Relationships**).

---

### 2. Focus management on step change (2.4.3, 3.2.x)

A step transition replaces the page's main content without a document navigation. If focus is not moved, it stays on the now-removed "Next" button → falls to `<body>` → the screen-reader user hears nothing and the keyboard user starts from the top of the page.

```tsx
// ❌ never — advance state and leave focus wherever it was.
setStep((s) => s + 1); // SR user hears silence; focus is on a detached node

// ✅ always — move focus to the new step's heading and reset scroll.
const headingRef = useRef<HTMLHeadingElement>(null);
useEffect(() => {
  headingRef.current?.focus();           // tabIndex={-1} on the <h1>
  window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
}, [step]);
// <h1 tabIndex={-1} ref={headingRef} id="welcome-step-heading">
```

Note: `ProjectApplicationPage.tsx` (the multi-step page we mirror) advances via `setStep` at `src/pages/ProjectApplicationPage.tsx:146,562` with **no focus move and no SR step announcement** — do **not** copy that omission; it is a gap in the source pattern, not a template.

Back navigation returns focus to the new (previous) step's `<h1>`, same mechanism. Never return focus to the top nav.

---

### 3. Step progress must be announced (Stepper / MobileStepper — first app usage)

`Stepper` and `MobileStepper` are re-exported MUI primitives (`src/design-system/components/molecules/Stepper.tsx:7`, `MobileStepper.tsx:6`) with **no prior usage in this app** and **no built-in SR progress semantics** — the desktop `Stepper` renders visual step labels only; `MobileStepper`'s dots/bar are decorative. A sighted user sees "3 of 7"; a screen-reader user hears nothing about position.

```tsx
// ❌ never — rely on the visual Stepper/dots alone for progress.
<MobileStepper variant="dots" steps={7} activeStep={step} /> // dots = decorative

// ✅ always — pair the visual indicator with programmatic + announced progress.
<nav aria-label="Onboarding progress">
  <Stepper activeStep={step} aria-hidden="true">{/* visual only */}</Stepper>
</nav>
{/* one persistent polite live region for step changes */}
<p className="sr-only" aria-live="polite" aria-atomic="true">
  Step {step + 1} of {TOTAL_STEPS}: {stepTitle}
</p>
{/* the active <li> carries aria-current for AT that walks the stepper */}
<li aria-current="step">…</li>
```

- The live region is rendered **once, persistently** (not created on change), and updated by text — so AT reliably announces it (**4.1.3 Status Messages**).
- Progress text is real text, never conveyed by dot color/fill alone (**1.4.1 Use of Color**).

---

### 4. Toggle / Switch semantics — OFF-by-default must be *announced* (1.3.1, 4.1.2)

The step-(e) newsletter opt-in is a Switch, OFF by default (step-d preference toggles are removed, P9). Two defects in the current DS primitives will silently ship an inaccessible toggle unless fixed:

**4a. MUI `Switch` announces "checkbox", not "switch", and has no bound label/state.** `src/design-system/components/atoms/Switch.tsx:8` is a bare MUI pass-through. A binary on/off control should expose `role="switch"` so AT announces "off/on", not "unchecked".

```tsx
// ❌ never — bare Switch: SR says "Teams, practice agile, checkbox, not checked"
<Switch checked={value} onChange={...} />

// ✅ always — switch role + a programmatic name; OFF state is announced as "off".
<Switch
  checked={value}
  onChange={(e) => onChange(e.target.checked)}
  inputProps={{ role: "switch", "aria-label": optionLabel }}
/>
```

**4b. `Field` associates the description to the *wrong node* for switches.** `Field` clones `aria-describedby` onto its single child element (`src/design-system/components/molecules/Field.tsx:36-47`). `RHFSwitch` returns a wrapping `<div>` (`RHFSwitch.tsx:24-36`), so the describedby lands on the `<div>`, **not** the focusable `<input>` — the hint/error is never announced for a toggle.

```tsx
// ❌ never — wrap RHFSwitch in Field and assume the helper text is associated.
<Field helperText="Syncs with the newsletter" error={err}>
  <RHFSwitch name="newsletter" control={control} /> {/* describedby → <div> */}
</Field>

// ✅ always — put aria-describedby / aria-invalid on the input itself, and
// render the helper/error in a linked, role="alert" region (reuse Field's
// message markup, but target the control, not a wrapper).
<Switch inputProps={{ role: "switch", "aria-describedby": msgId, "aria-invalid": !!err }} />
<Text id={msgId} role={err ? "alert" : undefined}>{err ?? helper}</Text>
```

Both are **build blockers** for steps d/e (listed below). Do not use the pressed-state `Toggle` atom for these (the brief already forbids it) — `Toggle` = a button with `aria-pressed`, wrong semantics for a persisted preference.

---

### 5. Accessible forms for steps (d) and (f) (1.3.1, 3.3.1–3.3.3, 1.3.5)

The DS `Field` already does the right things for standard inputs: `aria-describedby` linking, **assertive `role="alert"` error text**, **required marked in text** (`(required)`), and it's verified by test (`Field.tsx:8-13,34-70`; `responsive-a11y.test.tsx:52-73`). Build steps (d)/(f) **on `Field` + the RHF adapters**, not hand-rolled inputs.

| Requirement | SC | How |
|---|---|---|
| Every field has a programmatic label | 1.3.1 / 3.3.2 | `Field label=…` + `htmlFor`; toggle group in a `<fieldset><legend>` |
| Errors in text, linked, with a fix suggestion | 3.3.1 / 3.3.3 | `Field error="Enter a valid email address"` (not "Invalid") — `role="alert"` |
| Not color-alone for error/required | 1.4.1 | Field renders text `*` + `(required)` and text error, not just red |
| Correct input type + autofill | 1.3.5 | step-f: `type="url"` + `autocomplete="url"` for portfolio/linkedin/scheduling; `autocomplete="given-name"/"family-name"`; `autocomplete="email"` on the step-e override email |
| Grouped related controls | 1.3.1 | the step-f form fields share a labelled group; any related control set uses `<fieldset><legend>` (the step-d option group is removed, P9) |
| Server email-override validated + announced | 3.3.1 | validate format client- **and** server-side (per Architecture §4); surface the server rejection in the field's `role="alert"`, not a toast only |

```tsx
// ❌ never — placeholder as the only label; vague error.
<input placeholder="Email" /> …later… setError("Invalid")

// ✅ always — real label + typed + autocomplete + actionable error.
<Field label="Mailing-list email" htmlFor="ml-email"
       error={err /* "Enter a valid email address, e.g. you@example.com" */}>
  <Input id="ml-email" type="email" autoComplete="email"
         defaultValue={signupEmail} />
</Field>
```

---

### 6. Plain language & low cognitive load (3.1.5, usability)

- **One decision per step.** The 7-step split already does this; keep it — never merge toggles + profile fields onto one screen.
- **Reading level: aim ≈ grade 8** for headings/body/CTA (this app serves a global, ESL-inclusive audience). Short sentences, active voice, concrete verbs.
- **CTAs are verb + object, sentence case:** "Take me home", "Join Discord", "Finish onboarding" — never "Submit"/"OK"/"Continue?" alone.
- **No em dashes, no decorative icons/eyebrows in copy** (house UI convention). Illustrations are separate from copy and are decorative unless they carry meaning (§8).
- **Set expectations up front:** step (a) states this is a one-time, ~2-minute setup and that answers can be changed later in the profile — reduces anxiety about the un-skippable gate.
- **Nothing is mandatory to *answer*.** Toggles default OFF and staying OFF is a valid completion (error prevention, **3.3.4**). "Complete" means "saw the flow", not "opted into everything".

---

### 7. Forgiving recovery — no data loss across step/refresh/crash

A mandatory flow that loses a half-filled profile on refresh is hostile. Because each step writes to the **profile (server, single owner)** on advance (Architecture §3/§5), the recovery story is: **server is the source of resume truth; the client keeps only the last-viewed step index.**

```tsx
// ❌ never — in-progress answers live only in React state; refresh = start over.
const [goals, setGoals] = useState<string[]>([]); // lost on reload/crash

// ✅ always — advancing a step PERSISTS via ProfileService; on mount, rehydrate
// from useAuth().profile. Keep only the cursor in sessionStorage (per-viewer).
try { sessionStorage.setItem("welcome.step", String(step)); } catch { /* private mode */ }
// resume: min(savedStep, firstIncompleteStep(profile)) — never past unsaved work
```

- Mirror the **autosave** cadence from `ProjectApplicationPage` (`useAutosave`, `src/pages/ProjectApplicationPage.tsx:49,593`) so a slow network or tab-close mid-step doesn't lose the field.
- Every `sessionStorage`/`localStorage` access wrapped in try/catch (Safari private mode throws).
- **A failed profile fetch must not trap or bypass** (Architecture §2): show a retry/error state with a real `<button>` "Try again", not an infinite spinner and not a silent skip.

---

### 8. Perceivable visuals: alt text, contrast, focus, target size, motion

- **Illustrations (SVG imported as `<img>`, no SVGR):** meaningful `alt` for images that carry information, `alt=""` for purely decorative ones (**1.1.1**). Per `docs/brand/illustration-system.md`, Sketch-Fill = single flat brand blue, Engraving = brand mint. Because most are single-color decorative accents, default to `alt=""`; author real alt only where the image conveys step meaning. **Alt text is Figma-pending and must be authored per asset.**
- **Contrast — AAA (1.4.6):** ≥ **7:1** body text and ≥ **4.5:1** large text (AAA Enhanced), plus ≥ 3:1 UI component boundaries / focus ring (1.4.11). **⚠️ Brand blue `#0056A7` on white ≈ 6.7:1 — PASSES AA (4.5:1) but FAILS AAA normal-text (7:1).** Under the AAA target, brand-blue body text must use a **darkened brand token (≥ 7:1)** or be rendered as **large text** (≥ 24px, or ≥ 18.66px bold, where 4.5:1 suffices). Keep brand blue for large headings/CTAs; use a 7:1 token for small body copy. Also verify the OFF (grey) toggle track + thumb meet 3:1 (1.4.11) — grey-on-white is a common failure axe flags.
- **Visible focus (2.4.7 / 2.4.11 Focus Not Obscured):** reuse the global `:focus-visible` ring (`src/index.css:464`). Do not remove outlines. Ensure a focused control at the bottom of a `100dvh` step is not hidden behind a sticky footer CTA.
- **Target size — AAA (2.5.5 = 44×44):** the DS `Button` is **40px** tall (`Button.tsx:40-46`) — that **passes AA (24×24) but FAILS the AAA 44×44 target by 4px.** For this flow, size the interactive controls (buttons, the `Switch` hit-area, Back/Next) to **≥ 44×44** — a welcome-flow-scoped height override, or a DS size that meets 44 — and keep ≥ 8px spacing between stacked CTAs.
- **Reduced motion (2.3.3):** the global guard at `src/index.css:492` already neutralizes animation/transition under `prefers-reduced-motion: reduce`. Step transitions and stepper animation **must ride that guard** — no JS-driven animation that bypasses CSS. `e2e/regression/edge-cases/reduced-motion.e2e.ts` enforces "no motion > 50ms"; extend its route list to include `/welcome`.
- **No flashing** > 3×/sec (**2.3.1**) — trivially satisfied; just don't add a celebratory flash on step (g).

---

### 9. Mobile-first layout & cross-platform

- **Full-height without the iOS 100vh bug:** use the `h-dvh`/`min-h-dvh` utilities — the `@supports not (height: 100dvh)` fallback to `100vh` is already shipped (`src/index.css:426`). `e2e/regression/edge-cases/dvh-fallback.e2e.ts` guards it.
- **Safe areas:** apply `pt-safe`/`pb-safe`/`px-safe` (`src/index.css:549`) so the header and the sticky bottom CTA clear the notch and home indicator.
- **Single column, buttons stacked vertically, same style** (house convention + brief) — never a side-by-side button row that reflows badly at 320px.

```tsx
// ❌ never — horizontal CTA row; breaks/overlaps on narrow + high-zoom.
<Stack direction="row" spacing={2}><Button/>…<Button/></Stack>

// ✅ always — stacked, full-width, identical style; last item is primary.
<Stack direction="column" spacing={2} className="pb-safe">
  {ctas.map((c) => <Button key={c.to} asChild variant={c.primary ? "default":"outline"}>
    <Link to={c.to}>{c.label}</Link></Button>)}
</Stack>
```

- **Nav CTAs are real anchors, not buttons with onClick.** `Button asChild` renders a single styled `<a>` over a router `<Link>` (`Button.tsx:57-77`). Step-g "Take me home" → `/dashboard`, "Join Discord" → `/courses/connect-discord`, "Finish onboarding" → `/courses/onboarding` are **navigations** → use `asChild`+`Link` (middle-click/new-tab/right-click work, correct role announced). Next/Back/Finish-the-flow **mutate state** → real `<button>`.
- **Reflow (1.4.10):** usable at 320px and at 200% zoom with no horizontal scroll. The audit's `no-horizontal-scroll-at-320` probe (`e2e/a11y/wcag-audit.e2e.ts:280`) and `expectNoHorizontalOverflow` (`e2e/helpers/runtime-stability.ts:84`) enforce this on every listed route.
- **Feature detection, never UA sniffing:** gate any progressive enhancement on `@supports`/capability checks. The Fold profile even ships a UA string (`playwright.config.ts:55`) precisely to catch UA-branching regressions — don't branch on it.

```css
/* ❌ never — UA sniff to decide layout */  /* if (/iPhone/.test(navigator.userAgent)) … */
/* ✅ always — capability query */
@supports (height: 100dvh) { .welcome-shell { min-height: 100dvh; } }
```

**Support matrix (already defined by `playwright.config.ts:31-95` — the flow must pass all):**

| Class | Profiles (from config) | Min width |
|---|---|---|
| Desktop | Chrome, Firefox, WebKit/Safari, 1366, 4K@2x | 1366 |
| Mobile | Pixel 7, iPhone 14, **iPhone SE (375)**, **Z Fold (344)**, Pro Max (430) | **320 target** |
| Tablet | iPad Pro 11 portrait (834) + landscape (1194) | 834 |
| Network | slow-3G throttle profile | — |

---

### 10. Automated a11y + cross-browser checks to wire into CI

These are **existing** harnesses; the work is registration + fixtures, not new infra.

- [ ] **Add `/welcome` to `e2e/a11y/routes.ts`** as an `authed` route (plus the sign-out-reachable state). This auto-enrolls it in the axe audit (`wcag-audit.e2e.ts`) **and** the cross-browser responsive-stability sweep (`responsive-stability.e2e.ts:92`), which runs the full device matrix under `PLAYWRIGHT_FULL_MATRIX=1`.
- [ ] **Fixture the gate correctly (critical — see must-fix #1).** The audits bootstrap as an admin user and replay the session across routes (`wcag-audit.e2e.ts:97-199`). If that user's `welcome_flow_completed_at` is NULL, **every authed route redirects to `/welcome`** and the entire authed audit + cross-browser sweep measures the wrong page. The bootstrap user must be welcome-complete; add a **second, welcome-incomplete** fixture user to actually scan the flow steps.
- [ ] **axe over every step**, not just step (a). Drive the flow (seed a welcome-incomplete user, Tab/click through d→f) so axe walks each step's DOM; `enforce-baseline.mjs` gates new violations at 0.
- [ ] **`eslint-plugin-jsx-a11y`** (or equivalent) must lint the welcome-flow dir; pair it with the arch-encoded ban on `@/components/ui` + `lucide-react` in the dir (Architecture §8).
- [ ] **Keyboard-walk + reduced-motion:** extend `e2e/a11y/keyboard-walk.e2e.ts` and the `reduced-motion.e2e.ts` route list to `/welcome`.
- [ ] **Manual pass, documented:** one NVDA-or-VoiceOver run through all 7 steps; log it in the PR (axe covers ~57% per `wcag-audit.e2e.ts:29`; the rest — focus order, announcement quality, alt-text meaning — is human-verified).

---

### 11. A11y / UX acceptance checklist (Definition of Done for this section)

```gherkin
Feature: Welcome Flow accessibility

  Scenario: Keyboard-only user completes the mandatory flow
    Given a first-time user on /welcome using only the keyboard
    When they Tab through each step and press Enter on "Next"
    Then every control is reachable and operable (no keyboard trap, WCAG 2.1.2)
    And focus moves to the new step's <h1> on each advance (2.4.3)
    And they can reach "Finish onboarding" and log out without a mouse

  Scenario: Screen reader announces position and state
    Given a screen-reader user advancing from step 2 to step 3
    Then "Step 3 of 7, <title>" is announced via the polite live region (4.1.3)
    And each preference toggle announces its label and "off" by default (4.1.2)

  Scenario: No data loss on refresh mid-flow
    Given a user who edited a profile field on step (f) and reloads
    Then their step-(f) values are restored from the saved profile
    And they resume at the first incomplete step, not step (a)

  Scenario: Error is perceivable and actionable
    Given a user enters an invalid mailing-list override email on step (e)
    Then the error is shown in text, linked to the field, announced (3.3.1)
    And it suggests a valid format — not conveyed by color alone (1.4.1)

  Scenario: Reflow and reduced motion
    Given the device is 320px wide with prefers-reduced-motion: reduce
    Then no step scrolls horizontally (1.4.10)
    And no step transition animates beyond one frame (2.3.3)
```

- [ ] Each step: one `<h1>`, `<main>` landmark, logical heading order.
- [ ] Toggles expose `role="switch"`, bound label, OFF announced; describedby on the input.
- [ ] Contrast ≥ 4.5:1 text / ≥ 3:1 UI incl. the grey OFF toggle track.
- [ ] Visible focus on every control; focused control never hidden behind the sticky CTA.
- [ ] Targets ≥ 24px (AA), stacked CTAs full-width with ≥ 8px spacing.
- [ ] Illustrations: informative→real `alt`, decorative→`alt=""`.
- [ ] `/welcome` in `routes.ts`; axe + cross-browser + reduced-motion green; manual SR pass logged.

---

### 12. Re-audit additions — the gaps that made "WCAG 2.2 AA in full" not yet true

**B1 — No-JS / failed-bundle lockout fallback (Level-A availability on a mandatory gate).** Because the gate is a client-side redirect (§9.0) and the flow is mandatory, a failed, blocked, or not-yet-loaded JS bundle must not present a blank, un-escapable screen:
- Ship a static `<noscript>` block in `index.html` stating the platform needs JavaScript and giving a support contact.
- The app shell renders a **static error boundary with a visible support/contact link and a sign-out link** if the welcome bundle fails to mount — never a bare spinner.
- Treat "blank `/welcome`" as an **S1 wrongful-lockout** signal (§9.1). Gate-fail-**open** (letting users bypass) is **not** an acceptable mitigation here; a reachable help path is.

**B2 — WCAG 3.2.6 Consistent Help (Level A) + a defined support path.** Every step renders the **same** help affordance in the **same** location — a persistent "Need help? Contact support" link in the shell footer, beside the always-reachable sign-out. Define the "support path" the doc references (FR-g3 / the gate-lockout matrix) concretely (a `mailto:` or help URL), as a real `<a href>` (middle-click / new-tab correct), never an `onClick`. A member who cannot complete a mandatory step must be able to get help without abandoning the session.

**B3 — WCAG 3.3.7 Redundant Entry (Level A).** Covered by FR-f5 / AC-f4 (§4.8): step-f fields pre-populate from the member's existing profile so the ~767 existing members never re-type stored values. (The §12.5 forms table should carry the SC row: *"Previously provided info is not re-asked | 3.3.7 | step-f pre-fills from the shared `ProfileService` cache."*)

**I1 — Switch accessible-name, ONE source (reconciles §12.4a ↔ §13).** A goal/newsletter switch takes its name from one source: a **visible `<Label htmlFor={id}>`** that *is* the accessible name. Do **not** also set `aria-label` (it overrides the visible label and risks a 2.5.3 Label-in-Name mismatch). If the visible text is not an adjacent `<label>`, use `aria-labelledby` pointing at it — never a separate `aria-label` string. ❌ `<Label>Peer learning</Label><Switch inputProps={{'aria-label':'Learn with peers'}}/>` (two different names; the SR reads the aria-label → 2.5.3 fails).

**I2 — Persistent programmatic step position (reconciles §12.3 ↔ §13).** Because §13 renders the `MobileStepper` dots as decorative/aria-hidden, progress must **also** exist as persistent text in the accessibility tree, queryable on demand — not only the on-change live region. Render visible `Step {n} of 7` text (real text, 1.4.1) in the shell, keep the polite live region for the on-change announcement, and do not rely on `aria-current` on an aria-hidden stepper.

**I3 — browserslist build-target matrix.** Commit a `browserslist` config aligned to the Playwright support matrix (Blink/WebKit/Gecko + the min versions implied by the iPhone SE / Z-Fold / iPad profiles) so Autoprefixer and the transpiler read the same source of truth as the test matrix; non-Baseline CSS/JS in the flow carries an `@supports` fallback.

**I4 — Per-step state matrix (not only the failure state).** Each step defines four states: **LOADING** (any async read resolving); **IN-FLIGHT** (the Next/Finish button is **disabled with a spinner** while the step-save persists, so a double-tap cannot double-submit — mandatory on steps d/e/f and step-g completion; ties the bounded-write §6.5); **EMPTY** (e.g. step-d before any toggle); and **SUCCESS**.

**I5 — WCAG 2.2.1 Timing Adjustable / idle-timeout.** Reconcile with the idle-only session-timeout owner (`decisions.md`, ADR-0049): a slow or ESL reader must not be silently signed out mid-flow and lose work. State that the autosave + server resume (§12.7, AC-N3) returns the member to their saved step with values intact if re-auth occurs.

**I7 — Usability testing with real users (before the §11 rollout).** Run a lightweight task-based test (≥ 5 participants) spanning the ability/literacy/device spectrum (keyboard-only, screen-reader, ESL, low-end phone) completing the full 7-step flow; fix the top issues and retest. Distinct from the automated axe/cross-browser gates and the flag rollout.

**NICE.** (N1) low-end **CPU-throttle** pass + a JS **bundle budget** for `src/components/welcome/**` (the matrix has only slow-3G network throttle). (N2) per-engine/viewport **visual-regression** snapshots beyond the horizontal-overflow probe. (N3) 1.3.4 Orientation — works portrait AND landscape, no lock. (N4) confirm the flow rides the TFDS theme if a dark mode exists (else record N/A). (N5) `<html lang>` set (ESL audience). (N6) record explicit **N/A** decisions for 2.5.7 Dragging, 3.3.8 Accessible Authentication (the flow is post-auth), and 1.4.13 Content on Hover/Focus.

---

## 13. Design System & Asset Integration

This section is the concrete build-on-TFDS contract for the Welcome Flow. Every pixel renders through `@/design-system` (TFDS-on-MUI, ADR-0015). The barrel at `src/design-system/index.ts` already exports every component the flow needs — `Button` (`:23`), `Switch` (`:38`), `Card` family (`:61`), `Field` (`:70`), `RHFTextField`/`RHFSwitch` (`:132`,`:139`), `Stepper`/`Step`/`StepLabel` (`:207`), `MobileStepper` (`:208`), `SvgIcon` (`:203`), `Container` (`:13`), `Stack` (`:15`). **No new DS component is required.** Nothing is imported from `@mui/material`, `@/components/ui`, or `lucide-react` anywhere in the welcome-flow directory.

### The one rule that governs this whole section

The legacy `src/pages/WelcomeWizard.tsx` (`:14-22`) is the exact anti-pattern the new flow replaces — it imports shadcn primitives and writes Supabase directly:

```tsx
// ❌ never — legacy WelcomeWizard.tsx: shadcn UI + direct data access
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

// ✅ always — welcome-flow: TFDS barrel only; data via services/hooks
import { Button, Card, CardContent, Switch, Container, Stack } from "@/design-system";
// (profiles writes go through ProfileService — see the Data Ownership section)
```

---

### Not black-and-white — TFDS color AND font tokens only (explicit product requirement)

The flow renders in Tech Fleet's brand — **never greyscale, never a system default.** Every surface, text, and control color comes from TFDS tokens (`--primary` `#0056A7`, `--brand-mint` `#7DD8D0`, and the DS neutral/semantic tokens), **never a raw hex or a bare CSS color**; all type renders through the DS `<Text brand=…>` typography scale (the DS font family), **never a system/fallback font or an ad-hoc `<Typography>`/`<p>` with inline styles**.

```tsx
// ❌ never — greyscale, raw hex, system font, ad-hoc styles
<div style={{ color: "#111", fontFamily: "Arial" }}>Welcome</div>

// ✅ always — brand tokens + DS typography
<Text brand="display">Welcome to Tech Fleet</Text>
<Box sx={{ bgcolor: "primary.main", color: "primary.contrastText" }}>…</Box>
```

(Enforced alongside the `@/components/ui` + `lucide-react` ban below.)

---

### Per-step component map

Single column throughout: `<Container maxWidth="sm">` wrapping a `<Stack spacing={3}>`. Progress is a `MobileStepper` pinned to the shell footer (7 steps, `variant="dots"`), NOT an inline `Stepper` (too wide for mobile-first single column). CTAs are ALWAYS a vertical `<Stack spacing={1.5}>` of full-width `Button`s — never side-by-side (TFN UI convention).

| Step | Surface | DS components + props |
|------|---------|----------------------|
| (a) Welcome | `Card variant` + hero illustration | `<img src={welcomeHero} alt="…">`, `<Text brand="display">`, `<Button size="lg" fullWidth>` "Get started" |
| (b) Empowered team | content/illustration | `<img>` (Sketch-Fill), `<Text brand="body">`, back/next `Button`s |
| (c) Why training helps | content/illustration | same shell as (b) |
| ~~(d) What do you want to do~~ | **REMOVED (P9)** | step (d) is out of scope — no screen |
| (e) Newsletter | toggle + override email | `<Switch>` for opt-in; `RHFTextField name="marketingEmail" type="email">` (prefilled, editable) |
| (f) Profile | form | `RHFTextField` per Basic-Info field; `<CompletenessMeter>` reused as-is |
| (g) Start today | CTA hub | stacked `Button asChild` wrapping router `<Link>` (see below) |

**Router CTAs (step g) — `asChild` is mandatory.** `Button` supports the shadcn slot shim (`src/design-system/components/atoms/Button.tsx:34`, applied `:57`): it adopts the child element's type and renders a single styled anchor — never a `<button>` wrapping an `<a>`.

```tsx
// ❌ never — onClick navigation loses middle-click / open-in-new-tab / prefetch
<Button onClick={() => navigate("/dashboard")}>Take me home</Button>

// ✅ always — Button asChild → real router Link, one styled anchor
<Button asChild fullWidth size="lg"><Link to="/dashboard">Take me home</Link></Button>
<Button asChild fullWidth size="lg" variant="outline"><Link to="/courses/connect-discord">Join Discord</Link></Button>
<Button asChild fullWidth size="lg" variant="outline"><Link to="/courses/onboarding">Finish onboarding</Link></Button>
{/* Fixed CTAs only — step (d) is removed (P9), so there are NO goal-driven conditional CTAs. */}
```

**Newsletter toggle (step e) — `Switch`, never `Toggle`.** `Switch` (`src/design-system/components/atoms/Switch.tsx`) is the on/off control; the DS `Toggle` atom is a pressed-state button and is wrong here. (Step-d goal toggles are removed, P9 — step (e) is the only toggle in the flow.) OFF-by-default is expressed by OMITTING `defaultChecked` on an uncontrolled switch, or `checked={false}` when controlled:

```tsx
// ❌ never — defaultChecked flips the newsletter ON against the brief
<Switch defaultChecked onChange={...} />
// ❌ never — Toggle is a pressed-state button, not an on/off setting
<Toggle pressed={on} onPressedChange={setOn} />

// ✅ always — OFF by default; controlled from state; announced as a switch
<Switch checked={subscribed} onChange={(e) => setSubscribed(e.target.checked)}
  inputProps={{ role: "switch", "aria-label": "Sign me up for the newsletter" }} />
```

**Step-e / step-f fields — RHF adapters, not raw Input.** Use `RHFTextField` (`src/design-system/components/molecules/form/RHFTextField.tsx`) so label + error + `aria-describedby` wiring come from `Field` (`Field.tsx:29-73`, WCAG 1.3.1/3.3.1/4.1.3 built in). The override email is `type="email"` with a Zod email rule in the RHF resolver; the switch that reveals it is `RHFSwitch` (`checked={!!field.value}`, `RHFSwitch.tsx:27`).

```tsx
// ❌ never — hand-rolled label/error markup, no aria-describedby
<label>Mailing email<input value={email} /></label>{err && <span>{err}</span>}

// ✅ always — RHFTextField carries Field's a11y + error live region
<RHFTextField name="marketingEmail" control={control} label="Mailing list email"
  type="email" helperText="We'll use this for the newsletter only." />
```

---

### Un-skippable full-screen page shell

A routed page at `/welcome` (not a Dialog/overlay — those are dismissable and were the legacy `WelcomeDialog` mistake). The shell renders full-viewport with safe-area insets and has **no Skip / no close affordance**; the only way out is completing step g (which sets `welcome_flow_completed_at`).

```tsx
// WelcomeFlowShell — single-column, 100dvh, safe-area, no Skip
<Box sx={{ minHeight: "100dvh", display: "flex", flexDirection: "column",
           pt: "env(safe-area-inset-top)", pb: "env(safe-area-inset-bottom)",
           px: 2 }}>
  <Container maxWidth="sm" sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
    <Stack spacing={3} sx={{ flex: 1 }}>{/* step body */}</Stack>
  </Container>
  <MobileStepper variant="dots" steps={7} position="static" activeStep={step}
     backButton={<Button size="sm" variant="ghost" onClick={back} disabled={step===0}>Back</Button>}
     nextButton={<Button size="sm" onClick={next}>Next</Button>} />
</Box>
```

- Use `100dvh` (dynamic viewport) not `100vh` — `100vh` is banned by `css-portability/no-vh-units` (eslint.config.js `:291`) because it breaks under mobile browser chrome.
- `MobileStepper` REQUIRES both `backButton` and `nextButton` props (MUI contract) — they are not optional.
- No `<Skip>` button anywhere; removing Skip is part of retiring the legacy wizard.

---

### Illustration & SVG asset pipeline (new vector art from Figma; NO SVGR)

> **Reconcile with what already ships + the Figma read (2026-10-09).** The Figma prototype (node `8770:8597`, READ via the REST API — §15.2 / Appendix A) uses **unDraw-style SVG illustrations plus a "peep" character**, which **supersede** the legacy committed raster set (`src/assets/welcome-slide-{1..5}-v2.png` + `-v2-480.avif/webp`, imported by the retiring `src/components/WelcomeDialog.tsx:13-17`). So the new flow uses **new vector (SVG) assets** exported from Figma into `src/assets/welcome-flow/`, rendered via URL import + `<img alt>` (the `DashboardPage.tsx:14` pattern) — **not** the legacy raster and **not** SVGR. **Asset lifecycle:** the `welcome-slide-*` raster is retired *with* `WelcomeDialog` (contract PR after GA); until then, leave those files in place (do not delete assets a still-shipping legacy component imports). The responsive `<picture>` fallback below remains available only if a specific illustration ships as raster.

```tsx
// ✅ new vector art — export each Figma illustration to src/assets/welcome-flow/, URL-import + <img alt>
import welcomeHero from "@/assets/welcome-flow/welcome-a-hero.svg";
<img src={welcomeHero} alt="…" width={320} height={240} loading="lazy" />

// (fallback only) responsive raster via <picture> — avif→webp→png — if an asset ships as raster
// import heroPng from "@/assets/welcome-flow/welcome-a-hero.png";  etc.
```

For the new vector art, mirror the existing pattern — `src/pages/DashboardPage.tsx:14` imports an SVG as a URL and renders it via `<img>`:

```tsx
// ❌ never — SVGR component import (no SVGR in this repo; adds a build dep)
import { ReactComponent as WelcomeHero } from "@/assets/welcome-flow/hero.svg";

// ✅ illustrations — URL import + <img> with alt (like DashboardPage.tsx:14)
import welcomeHero from "@/assets/welcome-flow/welcome-hero.svg";
<img src={welcomeHero} alt="Two teammates building together" width={320} height={240} />

// ✅ inline brand glyphs — DS SvgIcon atom, theme-aware color/size
import { SvgIcon } from "@/design-system";
<SvgIcon inheritViewBox component={ArrowGlyph} aria-hidden fontSize="small" />
```

**Placement & naming convention**
- **New vector art:** `src/assets/welcome-flow/` (create it) — the Figma unDraw-style SVGs. The legacy `src/assets/welcome-slide-*` raster is **superseded** (it stays only until `WelcomeDialog` is retired in the post-GA contract PR, since that component still imports it — do not delete assets a shipping component references).
- File names: `welcome-<step-letter>-<subject>.svg`, kebab-case, e.g. `welcome-b-empowered-team.svg`.
- Run every exported SVG through **SVGO** before committing (strip editor metadata, `viewBox` retained, no hardcoded `width`/`height` on `<svg>` root so CSS sizes it).

**Brand family selection (docs/brand/illustration-system.md)**
- Full-page hero / large statements (steps a, g) → **Engraving** family, brand mint `#7DD8D0` / `--brand-mint`, never shrink below ~400px.
- Inline feature/content illustrations (steps b, c) and small glyphs → **Sketch-Fill** family, single flat `--primary` (`#0056A7`).

**Alt-text / ARIA rules**
- Meaningful illustration (conveys the step's concept): descriptive `alt` (WCAG 1.1.1).
- Purely decorative flourish: `alt=""` on `<img>`, or `aria-hidden` on inline `SvgIcon`.
- Inline `SvgIcon` used decoratively beside text MUST be `aria-hidden` so screen readers don't double-announce.

**Asset manifest (Figma node → file → step)** — fill in Figma node IDs when the prototypes are handed off:

| Step | Family | File (in `src/assets/welcome-flow/`) | Figma node | Alt / aria |
|------|--------|--------------------------------------|-----------|------------|
| (a) | Engraving | `welcome-a-hero.svg` | TBD | descriptive alt |
| (b) | Sketch-Fill | `welcome-b-empowered-team.svg` | TBD | descriptive alt |
| (c) | Sketch-Fill | `welcome-c-why-training.svg` | TBD | descriptive alt |
| ~~(d)~~ | — | step (d) removed (P9) — no glyphs | — | — |
| (e) | Sketch-Fill | `welcome-e-newsletter.svg` | TBD | decorative `alt=""` |
| (f) | Sketch-Fill | `welcome-f-profile.svg` | TBD | decorative `alt=""` |
| (g) | Engraving | `welcome-g-start.svg` | TBD | descriptive alt |

---

### ESLint rule banning `@/components/ui` + `lucide-react` in the welcome dir

Nothing bans these today — `design-system/no-direct-mui` (eslint.config.js `:444-452`) only stops raw `@mui/material`, and `@/components/ui`/`lucide-react` remain legal app-wide. Add a **welcome-flow-scoped** `no-restricted-imports` block, modeled on the existing file-scoped DS override (`:444`) and the pattern-list form (`:235-274`):

```js
// eslint.config.js — append a scoped block
{
  files: ["src/pages/WelcomePage.tsx", "src/components/welcome/**/*.{ts,tsx}"],   // the feature's REAL dirs (greenfield, verified not-yet-existing) — NOT welcome-flow/**, which would match zero files (a false-green guard)
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["@/components/ui", "@/components/ui/*"],
          message: "Welcome Flow builds on @/design-system only — not shadcn @/components/ui." },
        { group: ["lucide-react"],
          message: "Use the DS SvgIcon atom / brand SVG assets, not lucide-react icons." },
      ],
    }],
  },
},
```

```tsx
// ❌ never — inside src/components/welcome/** or src/pages/WelcomePage.tsx
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

// ✅ always
import { Button, SvgIcon } from "@/design-system";
```

Encode this via the `arch-encode` skill so it lands with a negative example in a **scoped `src/components/welcome/CLAUDE.md`** (create it — correct altitude), and set it to **error** (not warn) — it is a greenfield directory with zero legacy violations to grandfather.

**Three mechanical `arch-gate.config.json` rules — root file, NOT `scripts/ci/arch-gate.config.json` (which does not exist).** Each ships with a discriminating guard test (`verify-guard-test-discrimination.mjs`):

1. **DS-only imports** in `src/components/welcome/**` + `src/pages/WelcomePage.tsx` — `forbid` `from ['"]@/components/ui` and `from ['"]lucide-react['"]` (the ESLint rule's intent, enforced in the arch gate too).
2. **Single writer for the completion column** (the task's "ban a 2nd writer" — convention-only today): `include` `src/**` + `supabase/functions/**`, `exclude` `src/services/profile.service.ts` + tests, `forbid` `welcome_flow_completed_at\s*:` outside the owner. `welcome_flow_completed_at` is set ONLY by `mark_welcome_flow_complete()` (set-once, §6.5); a second writer breaks set-once (the ADR-0050 two-writer class). Mirror the ❌/✅ in the scoped `CLAUDE.md`. (The goals column is removed — P9 — so no goals-writer rule is needed.)
3. **No SVGR** in the welcome dirs: `forbid` `ReactComponent\b` and `\.svg\?react` — import an SVG as a URL + `<img alt>` (or the raster `<picture>`, below), never as a component.

---

### Multi-step mechanics (mirror ProjectApplicationPage, re-expressed on DS)

`src/pages/ProjectApplicationPage.tsx` is the reference: `const [step, setStep] = useState(1)` (`:146`), each advance persists `current_step` to the server draft (`:390`, `handleNext` `:520`) and load restores it (`:284`). Re-express the same shape on DS:

- **Persisted step**: hold `step` in React state; persist progress the same way the completion flag is owned — do NOT keep step in `localStorage` (that was the legacy `WelcomeDialog` gate being retired). Because the flow is un-skippable and re-entrant, resuming mid-flow is acceptable but the *authoritative* completion signal is the server `welcome_flow_completed_at` column, not step position.
- **next/back**: `next()`/`back()` bounded `[0, 6]`; `back` disabled on step 0; there is no forward-skip past unvalidated steps (step e/f validate via the RHF resolver before `next`).
- **Progress UI**: `MobileStepper activeStep={step}` in the shell footer (above).

```gherkin
Scenario: Back is disabled on the first step
  Given a first-time user on the Welcome Flow at step (a)
  Then the "Back" control is disabled
  And there is no "Skip" control anywhere on the page

Scenario: Step advance persists a profile field before navigation
  Given the user is on step (f) and edits their Portfolio URL
  When they press "Next"
  Then the field is written through ProfileService before step (g) renders
  And re-entering the flow shows that value still set
```

---

### Explicit TBDs (Figma-pending assets/content)

- [ ] Illustrations: **export the unDraw-style SVGs + peep character from Figma** (node `8770:8597`, READ — §15.2) into `src/assets/welcome-flow/`, one per step, via SVGO; URL-import + `<img alt>` (no SVGR). The legacy `welcome-slide-*` raster is superseded and retired with `WelcomeDialog`.
- [ ] ~~Full step-(d) option set + glyphs~~ — step (d) removed (P9); N/A.
- [ ] Step-(f) field list from the Figma read: First Name, Last Name, Country, Portfolio URL, LinkedIn URL (map to existing `ProfileService` columns; the design's "State" has no column and is not collected — P11).
- [ ] Step-(a)/(g) hero illustration family confirmation (Engraving assumed; confirm against Figma).
- [ ] Copy strings for each step (sentence case, verb+object CTAs, no em dashes/decorative icons — enforced by `brand-terms` lint).


---

## 14. Architecture Decision Log

These are the load‑bearing decisions this document commits to. Each will be formalized in an ADR during the build (see §15 for numbering). "Rejected" columns record the alternative and why it loses — they are the guardrails a future change must not quietly cross.

| # | Decision | Rationale | Rejected alternative |
|---|---|---|---|
| D1 | **Completion is a new `profiles.welcome_flow_completed_at timestamptz NULL`**, written once through a single owner. | Distinct fact from the legacy `onboarded_at` (read by `v_profile_readiness` + admin, set on *skip* by the old wizard). NULL for all existing users ⇒ everyone sees the flow exactly once. | Overloading `onboarded_at` → conflates two facts, breaks existing readers, lets the skippable path mark the mandatory flow done. |
| D2 | **The gate is a route guard composed at the `ProtectedRoute` seam** (`useWelcomeGate` + a wrapper), outside the frozen auth layer, with a strict **three‑state contract** (loading → spinner; fetch‑failed → retry; else → redirect). | One seam covers ~50 routes; fail‑safe against the `AuthContext` 10s‑timeout/null‑profile behaviour. | A `main.tsx` boot band‑aid (CLAUDE.md forbids); a two‑state guard (loops completers or lets un‑onboarded bypass); a modal (not un‑skippable, a11y trap). |
| ~~D3~~ | **REMOVED (P9):** step (d) and its goals column are out of scope — no `welcome_flow_goals`, no "Preferences" surface. | — | — |
| D4 | **"Bidirectional sync" = one owner, not two copies** — now governs the step-(f) profile fields. The flow's step (f) and the EditProfile "Basic Information" page both write through `ProfileService` + the shared React Query cache. | The requirement's "do not build them separately" is satisfied by a single source, not by mirroring + effects. | `useEffect` mirroring of profile state into flow‑local state (the ADR‑0051 draft‑race class of bug; trips the `keepInSync` gate builtin). |
| D5 | **Newsletter reuses the existing Email Octopus RPC;** no marketing state on `profiles`. | ADR‑0017: EO is the source of truth, fail‑open queue, server‑side only. Default‑off ⇒ enqueue only on opt‑in. | A `profiles.newsletter_opt_in` boolean "kept in sync" with EO → guaranteed drift + a compliance breach on dropped opt‑outs. |
| D6 | **The override mailing‑list email is its own owned mapping + ADR 20261009-welcome-flow-eo-extension**, with its own read path, validation, and GDPR‑erasure trigger. | `profiles.email` is immutable and every EO read + the DSAR erasure trigger key off it; an override address is invisible to all of them and would orphan PII on deletion. | Storing the override on `profiles` (ADR‑0017 forbids); bolting an email param onto the self‑only RPC without verification (account‑takeover / spam vector). |
| D7 | **Build only on TFDS (`@/design-system`)**; SVGs as vendored assets (`<img alt>`)/`SvgIcon`; add an ESLint rule banning `@/components/ui` + `lucide-react` in the welcome dir. | ADR‑0015 target; nothing mechanically stops legacy leak today, and the legacy wizard is the anti‑pattern. | Copying `WelcomeWizard`/`ProjectApplicationPage` (drags legacy stack + a data‑access‑in‑component violation into new code). |
| D8 | **Flagless 100% launch (product decision, 2026-10-09).** No feature flag, no canary; the flow is built and reachable via Courses across PR1–PR4, then the **gate PR (PR5) merges last and IS the launch**; recovery is a frontend bundle revert (minutes). | Product chose a single clean launch over a flag; the compensating controls (lockout-safety merge-gate, fail-safe three-state gate, gate-PR-last ordering, named on-call) make the accepted residual risk bounded (§11.2). | A feature flag / canary (rejected by product); big-bang enable with the flow half-built; divergent conditions for render vs redirect (lockout or loop). |
| D9 | **The Welcome Flow is also a durable, re-enterable Courses entry** — the first card in the first Courses tab — and the Courses page shows a **live-derived** completion-count stat. | The Dashboard Get-Started card disappears once all Get-Started courses are done, so Courses is the permanent access point; replay is allowed (completion marker stays set); the stat follows ADR-0050 (live `count(*)` via a read RPC, §6.13), never a stored counter. | A stored/incremented completion counter (ADR-0050 two-writer drift class); hiding the flow once Get-Started is complete (no durable re-entry); gating replay behind clearing the completion fact (would re-arm the mandatory gate). |

**ADRs to author (build phase) — split per MADR one-decision-per-ADR; date-prefix IDs per the repo convention (PR #414), so there are no numbers to reconcile (see §11.7):**
- **ADR 20261009-welcome-flow-gate** — mandatory Welcome-Flow gate at the `ProtectedRoute` seam, **flagless 100% launch** (no flag; gate PR merges last; frontend-revert rollback), legacy-wizard retirement, and "no new service boundary" (absorbs **D2, D8**, and §5.1's style decision).
- **ADR 20261009-welcome-flow-data-model** — Welcome-Flow profile data model & ownership: `welcome_flow_completed_at` set-once; single writer (`ProfileService`); "bidirectional sync = one copy" for the step-(f) profile fields (absorbs **D1**; **D3/D4 dropped with step (d)**, P9).
- **ADR 20261009-welcome-flow-eo-extension** — Email-Octopus ownership extension: the marketing-email override owned table + self-scoped RPCs + `handle_user_deletion` EO-delete + `REQUIRED` guard entry + additive `p_source='welcome_flow'` (absorbs **D6** and the former open P7; **forward-links, does not supersede, ADR‑0017**).

Each ADR MUST carry the MADR **Consequences** section (accepted downsides), which the decision table above omits. The card-visibility decision (§4.10 / P3) is recorded in ADR 20261009-welcome-flow-gate's Consequences. IDs follow the repo's date-prefix convention (`YYYYMMDD-slug.md`, PR #414) — no number to reconcile; the three share the date 20261009 and are unique by filename.

---

## 15. Open Questions, Product Decisions & Pre‑Build Blockers

### 15.1 Product decisions needed (owner sign‑off)

| # | Question | Recommendation |
|---|---|---|
| P1 | **Ship the override mailing‑list email in v1, or fast‑follow?** It is the single largest scope + compliance driver (ADR 20261009-welcome-flow-eo-extension, erasure cascade, double opt‑in). | Fast‑follow (PR5) so it can't delay/destabilize the core; step (e) ships signup‑email‑only first. |
| P2 | **Are admins/teachers forced through the flow too, or exempt?** | **Resolved: everyone** — all members, all teachers, all admins; no exemption (§4.1 FR‑G2). |
| P3 | **Must the "Welcome" completion card be non‑hideable** in Get Started? (the `core_courses` widget is user‑hideable/reorderable). | **Resolved (§4.10 / §5.3c):** render in the normal hideable Get Started widget — completion is server‑enforced, so hiding has zero correctness impact. Non‑hideable only as a conscious, documented exception if product wants guaranteed visual confirmation. |
| P4 | **WCAG target for this mandatory flow:** AA or AAA? | **Resolved: AAA** (§12). Two AAA gaps to close: brand-blue body-text contrast (6.7:1 < 7:1) and the 40px button height (< 44×44) — §12.8. |
| P5 | **Does the Email Octopus list use double opt‑in?** | **Resolved: yes.** Step-e copy promises a confirmation email; the toggle reflects intent, not a completed subscription (§4.7 FR‑e2, §8.2). |
| P6 | **Audit‑log the step‑(f) Basic‑Info edits?** | **Resolved (§8.4):** mandate — extend `audit_profile_changes` for `portfolio_url,linkedin_url` (the surfaced step-f fields it doesn't already track; first/last/country are already audited). Step‑d goals audit is moot — step (d) removed (P9). |
| P7 | **Record opt‑in source as `'welcome_flow'`** (needs an additive RPC expand) **or reuse `'profile'`?** | **Resolved:** add `'welcome_flow'` additively to the RPC's accepted set (ADR 20261009-welcome-flow-eo-extension); never send a value it silently coerces. |
| P8 | **Step (b) "empowered team" — own screen or folded?** | **Resolved: folded into Welcome** (content changed; no separate screen). §4.4. |
| P9 | **Step (d) "What do you want to do" + goals — keep or remove?** | **Resolved: REMOVED** — no goals column, no Preferences sync, no d1/d2 conditional CTAs (§4.6, propagated doc-wide). |
| P10 | **Newsletter consent copy ("no third parties") — EO is a subprocessor.** | **Resolved: reworded** (names Email Octopus, promises confirmation email). Exact copy in §4.7 FR‑e1. |
| P11 | **Step-f "State" field + required-vs-optional.** | **Resolved:** sync to **existing** profile columns only — **"State" not collected** (no such column); all step-f fields **optional to advance**. §4.8 FR‑f1 / FR‑f1a. |

### 15.2 Figma content — READ (2026-10-09); residual asset-export work only

> **Status: the Figma read is DONE.** The latest prototype page (node `8770:8597`) was read via the Figma REST API (read-scope `FIGMA_TOKEN`, now to be rotated — it was shared in chat). Five screens confirmed: **Welcome → Why it's helpful → Newsletter → Profile → Start**, two-column desktop layout (left Tech Fleet branding panel + right content), check-style progress indicator, Back/Next nav, and **unDraw-style SVG illustrations + a "peep" character** (superseding the legacy `welcome-slide` raster — §13). The remaining work is **asset export + copy finalization**, not a blocked read:

- ~~Full step‑(d) option set + display labels~~ — step (d) removed (P9); no goals constant, no d1/d2 routing.
- **Step‑(f) field list — confirmed from the read:** First Name, Last Name, Country, Portfolio URL, LinkedIn URL (all map to existing `ProfileService` columns); the design's "State" has no column and is **not collected** (P11).
- **All step copy (a–g)** authored to ~grade‑8 reading level, sentence case, verb+object CTAs, no em dashes/decorative icons.
- **The illustration + icon SVGs** → `src/assets/welcome-flow/` (SVGO‑optimized), with **per‑asset alt text** (informative vs decorative `alt=""`).
- **The step‑(e) override‑email UI** layout.

### 15.3 Engineering pre‑build blockers

Consolidated from all discipline sections; each is verified against a real file. Nothing in this list may be skipped as "trivial."

**Gate correctness & lockout safety**
- [ ] Implement the **three‑state** gate exactly (spinner / retry‑error / redirect); a profile‑read failure resolves to **retry**, never allow (bypass) or redirect (loop). `AuthContext.fetchProfile` sets `profileLoaded=true` in `finally` and can leave `profile=null` (`AuthContext.tsx:170‑184`).
- [ ] The gate **wins over** `AuthRedirectHandler`'s `/dashboard` landing (`AuthRedirectHandler.tsx:47‑60`); **allowlist** `/welcome` + every sign‑out path; sequence **after** `MfaEnforcementGuard`; build **outside** `src/features/auth/**`, `src/lib/auth/**`, `main.tsx`, the supabase client.
- [ ] **Flagless (§11.2): there is NO feature flag in the gate path** — the gate arms on `authenticated + welcome_flow_completed_at IS NULL` alone. The only state to distinguish is a successfully-read null completion (show flow) vs a profile‑read‑failed state (retry). (No `useFeatureFlag`, no flag fail-open branch to implement or test.)
- [ ] The step‑(g) finish CTA **awaits and confirms** the completion write before navigating.

**Data ownership & schema**
- [ ] Extend `ProfileService.fetch()` explicit select (`profile.service.ts:52`) to include `welcome_flow_completed_at` (the one new column), or `useAuth().profile` never exposes it (mass wrongful lockout). Unit‑test the select string. (No goals column — P9.)
- [ ] Completion write = **no‑arg `SECURITY DEFINER` RPC keyed on `auth.uid()`**, **idempotent / set‑once** (set only when null), with RLS `FOR UPDATE USING(auth.uid()=user_id)` backstop; never accept a client‑supplied `user_id`. `welcome_flow_completed_at` must **never** be in the generic `updateFields` allow‑list (set-once belongs only to the RPC).
- [ ] Every step‑(f) field added to **both** the zod schema (`validators/profile.ts`) **and** the `ProfileService` allow‑list (`profile.service.ts:160‑179`), or `updateFields` silently drops it.
- [ ] Migration is **expand‑only, additive, idempotent** (`IF NOT EXISTS`): `welcome_flow_completed_at` stays **nullable permanently** (no goals column — P9; no `state` column — P11, step (f) syncs to existing columns only). No backfill‑as‑complete. PG15 metadata‑only add (no rewrite on ~767 rows). Do not drop/overload `onboarded_at`. `profiles` is **row‑scoped** RLS — no per‑column grant (do not copy ADR‑0056).

**Email Octopus**
- [ ] **Expand** `set_my_marketing_subscription` additively to accept `p_source='welcome_flow'` **before** the consumer sends it (today it coerces unknown → `'profile'`, `20260822120000_email_octopus_sync.sql:87‑88`). Provider Deno contract test asserts the accepted set.
- [ ] Default‑OFF ⇒ enqueue **only** on opt‑in (no contact for non‑subscribers). Display value from `get_my_marketing_subscription()`, not the live read.
- [ ] Override email (ADR 20261009-welcome-flow-eo-extension) requires: owned mapping table + self‑scoped read/write RPCs + **server‑side email + CR/LF validation** + rate limiting + no‑enumeration response + **its own `handle_user_deletion` EO‑delete‑enqueue** + a REQUIRED entry in `check-erasure-completeness.mjs` + pgTAP. Double‑opt‑in ownership verification before subscribe.

**Release / migrations**
- [ ] Confirm ADR‑0045 auto‑apply prerequisites are **live** (`SUPABASE_DB_PASSWORD` secret, migration ledger bootstrapped) before any migration merges.
- [ ] **Expand‑first across two merges:** the column migration must merge **and be confirmed applied** (db‑schema‑gate green + `supabase db push --dry-run` clean) before any merged code names those columns.
- [ ] **No flag seed (flagless — §11.2).** The expand migration adds the column + RPCs only; nothing is "armed" until the gate PR (PR5) ships, and the gate arms on `welcome_flow_completed_at` alone. The gate PR merges **last**.
- [ ] Ship an admin‑gated **break‑glass reset** (`ProfileService.resetWelcomeFlow`, single writer) before the gate PR (PR5) — completion is irreversible per user and it is the only break-glass left under flagless; fully specified in §7.7 (admin-only via `has_role`, single-user, audited).
- [ ] Pick a migration timestamp that sorts after any parallel-branch migration (check `git log --all` for `supabase/migrations/`). ADR IDs use the **date-prefix convention** (`20261009-welcome-flow-gate` / `-data-model` / `-eo-extension`) — no number to assign or reconcile (PR #414).

**Testing / CI**
- [ ] **Coverage is a mustFix, not optional.** A coverage provider is not installed (no `@vitest/coverage-*`; `ci.yml:262` runs `vitest run --shard` with no `--coverage`). Add `@vitest/coverage-v8` + a scoped coverage lane (≥ 90% lines / ≥ 85% branches on welcome‑flow logic), plus **Stryker** on the two pure modules and **fast-check** on the override-email validator (§10.7).
- [ ] `bdd-gate.yml`: every new `src/pages/**` + `src/services/**` (+ any edge fn) is referenced **by path** in a test; page basenames ≥ 6 chars.
- [ ] The new arch‑gate/ESLint rule (ban `@/components/ui` + `lucide-react` in the welcome dir) ships with a **discriminating** guard test (`verify-guard-test-discrimination.mjs`).
- [ ] `useWelcomeGate`'s decision is a **pure function** returning a discriminated union (`wait|allow|redirect|error‑retry`), unit‑testable without rendering.

**Accessibility / CI fixtures**
- [ ] **CRITICAL fixture collision:** the axe audit (`e2e/a11y/wcag-audit.e2e.ts`) + responsive‑stability sweep bootstrap an admin user and replay **all** authed routes. Ensure that fixture user is **welcome‑complete** (else every route redirects to `/welcome` and audits measure the wrong page / `minScanned` may fail), **and** add a separate **welcome‑incomplete** fixture + a `/welcome` entry in `e2e/a11y/routes.ts`.
- [ ] `Switch` announces as "checkbox" — standardize `role="switch"` + bound accessible name so OFF‑by‑default announces "off". Fix `Field`↔`RHFSwitch` `aria-describedby` association (helper/error currently attach to a wrapping `div`, `RHFSwitch.tsx:24‑36`).
- [ ] `Stepper`/`MobileStepper` have no SR progress semantics + no prior usage — add `aria-current="step"` + a polite live region ("Step N of 7: <title>"); move focus to the step heading on every advance/back (the mirrored `ProjectApplicationPage` does **not**).
- [ ] The flow is a **routed page with landmarks**, not an `aria-modal` focus trap (WCAG 2.1.2); a keyboard‑reachable sign‑out stays on the gate allowlist. Verify OFF‑toggle track contrast ≥ 3:1 (1.4.11).

**Design system**
- [ ] Add the welcome‑scoped `no-restricted-imports` rule (globbed to the REAL dirs `src/components/welcome/**` + `src/pages/WelcomePage.tsx`, NOT `welcome-flow/**`) **before** writing any component. Buttons **vertically stacked**; shell is 100dvh + safe‑area with **no Skip/close**. Illustrations are the **new Figma unDraw-style SVGs** in `src/assets/welcome-flow/` via `<img alt>` / `SvgIcon` (no SVGR; the legacy raster is superseded — §13). Add the **no-black-and-white + TFDS color/font token** rule (§13).

**Re-audit must-fixes (new this pass — each verified against a real file)**
- [ ] **Bounded completion/preference writes.** `ProfileService` is direct supabase-js (`retryPostgrest` + `withAuthLockRetry`), **not** `invokeEdge`, so wrap the finish-CTA + preference writes in `withBoundedSave` (`src/lib/data/bounded-save.ts`, exists) — a hung write must not infinite-spin the final step (S1 lockout). The false "invokeEdge retries it" claim is struck (§6.5 / §9.4).
- [ ] ~~One schema name (`welcome_flow_goals`)~~ **— N/A: the goals column is removed (P9).** The only new column is `welcome_flow_completed_at` (no `state` column — P11, step (f) syncs to existing columns); the fetch-select names `welcome_flow_completed_at` only.
- [ ] **Override erasure lives inside `handle_user_deletion()`** (winning def `20260911120000:23`), not a standalone trigger (the ADR-0039 guard scans only `handle_user_deletion`); add the override table to its `REQUIRED` list; prove existing-email erasure still works (§6.8 / §8.3).
- [ ] **Stated indexing decision** for `welcome_flow_completed_at`, §6.11. (The goals shape-bound is moot — column removed, P9.)
- [ ] **No-JS / failed-bundle fallback** + **Consistent Help** (WCAG 3.2.6) + **Redundant Entry** step-f prefill (3.3.7) — §12.12 / §4.8.
- [ ] **`docs/security/owasp-coverage.md` updated** for every newly-enforced sheet (the real blocking OWASP gate), §7.6; `@security` scenarios land in e2e/gate-test/db-test, not "bdd-gate.yml".
- [ ] **Incident response & on-call** (paging, severity, roles, postmortem) before the gate PR (PR5) merges — §9.9; **compliance artifacts** (control-matrix, privacy-runbook, ROPA) — §8.9; **Supabase PITR confirmed** — §6.12.

---

## 16. Implementation Plan (phased)

Each PR is independently shippable and must pass the full gate (§17). Expand‑first ordering is mandatory (ADR‑0045 auto‑applies migrations on merge). **Flagless (§11.2): the gate PR merges LAST**, only once the whole flow is built and tested behind the still-un-gated `/welcome` route — there is no flag to dark-launch a half-built flow behind.

| PR | Content | Gates it must clear |
|---|---|---|
| **PR0 — enablers** | The 3 ADRs (`20261009-welcome-flow-{gate,data-model,eo-extension}`) + this requirements doc; the welcome‑dir **DS-only** ban (ESLint + arch-gate), the **single-writer** `welcome_flow_completed_at` rule, the **no-SVGR** welcome rule, and extending the live-stat rule to forbid a `welcome_flow_stats` counter — each proven by a discriminating fixture in `arch-gate.smoke.test.ts` (runs the REAL config: violation → exit 1, fix → exit 0); scoped `src/components/welcome/CLAUDE.md`. **No flag seed (flagless); no code files yet, so every new rule globs to a not-yet-existing welcome dir and is proven only by its fixture.** *(Deferred to the code PRs where they can actually enforce something: `docs/security/owasp-coverage.md` token updates ship with the controls (§7.6, PR3/PR5/PR6); `@vitest/coverage-v8` + the scoped coverage threshold lane ship with the first welcome-logic PR — a threshold lane over an empty dir is a false-green, and a devDep add requires a lockfile update, §10.7.)* | arch‑gate (real repo still exit 0), arch-gate smoke discrimination, judge‑arch |
| **PR1 — expand migration + service seam** | Additive migration (`welcome_flow_completed_at` nullable) + `mark_welcome_flow_complete()` RPC + the live **completion-count read RPC** (§6.13); additively expand `set_my_marketing_subscription` for `'welcome_flow'`; `ProfileService.fetch` select (bounded) + `markWelcomeFlowComplete`. **Merge + confirm applied before PR2.** | migration‑smoke, db‑schema‑gate, pgTAP, arch‑gate |
| **PR2 — flow screens (NOT yet gated)** | Routed `WelcomePage` on TFDS; step (a) Welcome (empowered-team folded in) + step (c) "Why it's helpful"; bounded writes; reachable only by direct nav to `/welcome`. | bdd-gate; a11y **AAA** incl. no-JS fallback + Consistent Help; reduced-motion |
| **PR3 — steps e/f** | Newsletter opt‑in (double-opt-in, reworded consent, existing EO RPC); Basic‑Information persistence (bidirectional with EditProfile, **optional-to-advance**) + completeness audit. | EO contract test, bidirectional‑sync e2e (profile fields), a11y forms |
| **PR4 — Courses entry + stat + Dashboard card + retire legacy** | Welcome Flow as the **first card in the Courses first tab** (re-enterable, completion marker) + the **live completion stat** (§4.11); Get-Started "Welcome" card (not in courses); retire legacy `WelcomeWizard` + `WelcomeDialog`. | courses-entry e2e, **live-stat-not-counter** test, replay-idempotency e2e, delete-the-band-aid check |
| **PR5 — the gate (LAST — this is the launch; live 100% on merge)** | `useWelcomeGate` (pure decision) + `WelcomeGate` at `ProtectedRoute`, sequenced after `MfaEnforcementGuard`, allowlist `/welcome` + sign-out; break-glass `resetWelcomeFlow`. **Flagless: merging this makes the mandatory flow live for everyone on next login.** | **lockout-safety `@reliability` as a hard merge-blocker**; e2e un-skippable + no-trap/no-bypass; on-call + fast-revert ready |
| **PR6 — override email (ADR 20261009-welcome-flow-eo-extension)** *(fast‑follow per P1)* | Owned mapping + self‑scoped RPCs + validation + double‑opt‑in + erasure cascade (inside `handle_user_deletion`) + control-matrix/ROPA + DPIA. | erasure‑completeness, pgTAP, security review |

**Launch (flagless):** there is no canary/ramp. **PR5 (the gate) IS the launch** — on merge, the flow is live 100% for every incomplete user on their next login. Pre-launch hard gates: lockout-safety `@reliability` green, cutover capacity checked (§3 / §9.7), and on-call + fast-revert runbook ready (§9.9). Recovery = frontend revert (§9.5).

---

## 17. Definition of Done

A change in this feature is "done" only when **all** of the following hold (extends `CLAUDE.md`):

- [ ] **Both gate halves:** `npm run check:architecture` exits 0 (the `--changed` ratchet, no new waivers) **and** the `judge-arch` skill returns PASS (or every finding explicitly, datedly waived).
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run lint:css`, `npm run test` (Vitest), `npx playwright test` (e2e), `npm run build` all green; no new warnings.
- [ ] The required CI check **`ci / gate`** is green (plus `migration-smoke` + `db-schema-gate` on migration PRs, and the Cloudflare Workers Builds check).
- [ ] `bdd-gate.yml` satisfied — every changed page/service/edge‑fn referenced by a test path. The `@security` / `@compliance` / `@reliability` / `@release-safety` scenarios are **realized as executing Playwright/Vitest/pgTAP tests that block merge** (not merely "wired into bdd-gate.yml", which only checks path references — §7.6), and `docs/security/owasp-coverage.md` is updated so `check-owasp-coverage.mjs` (the real blocking OWASP gate) maps every newly-enforced sheet.
- [ ] **Lockout‑safety `@reliability` tests pass as a hard merge-blocker before the gate PR (PR5) merges** (flagless — the merge IS the launch, §11.2); the break‑glass admin reset exists.
- [ ] Migrations are expand‑only/idempotent and confirmed applied before dependent code merges; no drop/rename/NOT‑NULL‑in‑place.
- [ ] The **three** ADRs (`20261009-welcome-flow-gate`, `-data-model`, `-eo-extension`) are committed alongside the code, each with a MADR Consequences section — date-prefix IDs per the repo convention (no number to reconcile).
- [ ] No PII (override email, profile field values) in `ops_events`/`audit_log` telemetry — user id + event kind only.
- [ ] **Coverage lane green** (`@vitest/coverage-v8` ≥ 90% lines / 85% branches on welcome-flow logic; `welcomeGateDecision` 100% branch); Stryker (2 pure modules) + fast-check (override validator) where specified (§10.7).
- [ ] **Completion/preference writes are bounded** (`withBoundedSave`); the finish-CTA cannot infinite-spin (§6.5 / §9.4).
- [ ] **Incident response & on-call ready** (paging channel, severity levels, IC/comms/scribe, postmortem commitment) and the **PRR signed off by a named approver** before the gate PR (PR5) merges (§9.7 / §9.9).
- [ ] **Supabase PITR confirmed enabled**; backup/DR posture recorded (§6.12 / §8.9); the compliance **control-matrix + privacy-runbook + ROPA** updated (§8.9).
- [ ] **No black-and-white:** every color/font comes from TFDS tokens; the DS-only + single-writer arch-gate rules pass with discriminating guard tests (§13).
- [ ] Root cause + responsible layer named; repro that failed before / passes after; diff shown; obsolete band‑aids deleted.
- [ ] Commits end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; PR body ends with the Claude Code generation line.

---

## Appendix A — Source references

- **Requirements PDF:** `Improve Onboarding Flow - User Requirements.pdf` — the §4 flow is a faithful reproduction. Text extracted via `pdfjs-dist` (the box has no `pdftoppm`/Python).
- **Figma:** file `AqnScC6nnGsXUQHWWuL6Lm`, latest prototype page node `8770:8597` — **READ 2026-10-09** via the Figma REST API (read-scope `FIGMA_TOKEN`; **rotate it — it was shared in chat**). Five screens (Welcome → Why it's helpful → Newsletter → Profile → Start), two-column desktop layout, check-style progress, Back/Next, **unDraw-style SVG illustrations + a "peep" character** (supersede the legacy raster — §13). Re-export assets with `scripts/figma-extract.mjs` (ADR‑0010) + the Images API (`GET /v1/images/{key}?ids=8770:8597&format=svg`). Iteration pages are historical — spec this node only.
- **Codebase map:** the seam inventory behind §5–§13 (auth/routing, profile/`ProfileService`, Email Octopus, dashboard Get Started, TFDS, arch gate) is recorded in the project memory `tfn-welcome-flow-onboarding`.

---

## Appendix B — Enterprise-discipline coverage matrix (proof that none is skipped)

This document was re-audited in fresh context, **one subagent per discipline**, each loading the actual skill plus the repo's `decisions.md`, scoped `CLAUDE.md` files, and the repo's own `judge-arch` / `arch-encode`. Every gap found was closed in the sections cited below. The Figma prototype has been **read** (node `8770:8597`, 2026-10-09 — §15.2 / Appendix A); the only residual is **asset export + final copy strings**, structured as single-insertion-point TBDs (§13 / §15.2), which does not block the engineering requirements. The launch is **flagless** (§11.2, product decision 2026-10-09) and the flow is also a durable, re-enterable **Courses** entry with a live completion stat (§4.11 / D9).

| Discipline (skill) | Where it lives | Key mandates satisfied |
|---|---|---|
| **enterprise-architecture-standards** | §3 (NFRs), §5 (style / boundaries / four-questions / perf), §6 (data model, single-owner, indexing §6.11, backup/DR §6.12) | layered boundaries; one-fact-one-owner; resilience via bounded writes (§6.5); NFRs stated up front; O(1) gate |
| **architectural-decision-records** | §14 (log + the three split ADRs), §11.7 / §15.3 (ID convention) | one-decision-per-ADR (date-prefix IDs `20261009-welcome-flow-{gate,data-model,eo-extension}`), MADR Consequences, forward-link ADR-0017; date convention = no collisions |
| **judge-arch + the four-questions gate** | §5.3 (per-surface answers), §17 DoD (blocking) | boundary / ownership / dependency / error-handling answered per surface; gate is blocking (run the repo's scoped `judge-arch` on the diff) |
| **arch-encode** | §13 (DS-only + single-writer + no-SVGR arch-gate rules in a scoped `CLAUDE.md`) | negative-example rules wired to the mechanical gate, globbed to the REAL dirs, with discriminating guard tests |
| **owasp-secure-coding-bdd** | §7 (lockout matrix, A01/A03/A04, override abuse, break-glass §7.7, defense-in-depth §7.8, @security) | Step-0 lockout AND accidental-deletion sides; anti-automation; security logging; enforced via `check-owasp-coverage.mjs` |
| **compliance-data-lifecycle** | §6.7–6.12, §8 (classification, consent, erasure cascade, DPIA, audit, artifacts §8.9) | GDPR/CCPA consent; override erasure inside `handle_user_deletion` + guard; backup/DR/RTO-RPO; SOC2/ISO control matrix; ROPA |
| **bdd-comprehensive-testing** | §4 ACs, §7/§9/§10/§11 Gherkin, §10.9 traceability | happy + non-happy per step; every §4 AC traced to a named executing test |
| **comprehensive-test-strategy** | §10 (pyramid, contract, coverage/mutation/property §10.7, flaky §10.8) | EO contract catches the p_source defect; mandatory coverage; Stryker + fast-check; cutover naturally login-peak-bounded (no load suite, justified — flagless, no ramp) |
| **release-deployment-safety** | §11 (classification, expand-first two-merge, **flagless 100% launch + accepted residual risk + compensating controls**, blast-radius, frontend-revert rollback) | zero-downtime expand/contract under the two-pipeline race; **flagless launch** with the gate PR merging last; recovery = frontend bundle revert (minutes); residual risk recorded honestly |
| **sre-operational-readiness** | §9 (honest degradation, SLIs/SLOs, golden signals, alerts, runbook, PRR, on-call §9.9) | SLOs on the login path; symptom alerts; **frontend-revert rollback (no instant kill — flagless)**; runbook; incident response + postmortem; PRR launch gate |
| **universal-accessibility-wcag** | §12 (un-skippable≠trapped, focus, live region, switch/forms; §12.12 no-JS / Consistent-Help / Redundant-Entry) | **WCAG 2.2 AAA target (P4)** — AA in full plus the AAA gaps closed (7:1 text contrast, 44×44 targets, §12.8), the Level-A items (3.2.6, 3.3.7), and the no-JS lockout fallback |
| **universal-browser-device-support** | §12.9 (support matrix, feature detection), §12.12 (browserslist, low-end CPU, visual regression) | matrix from `playwright.config`; `@supports` not UA-sniff; build target aligned to the test matrix |
| **usability-ux-universal-design** | §12.6–12.7 (plain language, forgiving recovery), §12.12 (per-step states, usability testing) | one decision/step; nothing mandatory to answer; no data loss; LOADING/IN-FLIGHT/EMPTY/SUCCESS states; real-user testing |

**Repo governance also honored:** `decisions.md` (the four questions, `ProfileService` as sole `profiles` writer, expand/contract, gate integrity), root + scoped `CLAUDE.md`, the mandatory `npm run check:architecture` + `judge-arch` gate, `bdd-gate.yml`, `check-owasp-coverage.mjs`, and `check-erasure-completeness.mjs`.
