## Goal

Bake Tech Fleet's brand guide — voice, tone, editorial style, terminology, and visual rules — into every surface of Tech Fleet Network: UI copy, emails, error/empty/success states, alt text, link text, color tokens, typography hierarchy, and ongoing CI lint guards so we don't drift.

The guide's headline rules:

1. **Voice** — Welcoming, Caring, Informative. Plain language at a 7th-grade reading level.
2. **Editorial** — Active voice, sentence case headlines, "Tech Fleet" (two words), capitalize "Team Practices", inclusive terms ("people who use the product", "constituents", singular "they", capitalize "Black"/"Deaf", avoid "guys"/"crazy"/"lame"/"click here").
3. **UX copy** — Action verbs on CTAs ("Submit application" not "Submit"), empathetic error messages with a recovery path, celebratory-but-appropriate success messages, useful empty states, descriptive alt + link text.
4. **Visual** — Blues (trust) + greens (growth) + dark grays/blacks (authority). Sentence-case typographic hierarchy. Authentic, diverse imagery.

The platform already nails the dark/blue base, semantic tokens, WCAG 2.0/3.0, Inter typography, and i18n bridge — so this is mostly **copy, terminology, palette extension, and guardrails**, not a redesign.

## Plan

### Phase 1 — Codify the brand as machine-checkable rules

Create the source-of-truth files everything else references.

- `docs/brand/voice-and-tone.md` — Welcoming / Caring / Informative principles, do/don't examples per surface (auth, dashboard, applications, errors, emails).
- `docs/brand/editorial-style.md` — Sentence case, active voice, AP baseline, terminology table (Tech Fleet, Team Practices, constituents, people who use the product, etc.), inclusive-language rules, link-text rules.
- `docs/brand/ux-copy-patterns.md` — Templates for buttons, labels, error/success/empty states, with copy-paste examples.
- `mem://style/brand-voice` and `mem://style/editorial-rules` memory files indexed in `mem://index.md` Core so every future change applies them automatically.

### Phase 2 — Visual tokens that match the guide

Extend (don't replace) the existing dark space theme.

- Add `--brand-green` family (growth/healing) to `src/index.css` alongside the existing primary blue, plus `--brand-graphite` for authority surfaces. All HSL.
- Map them in `tailwind.config.ts` as `growth`, `growth-foreground`, `graphite`, `graphite-foreground` semantic tokens. No raw hex in components.
- Add a `--gradient-sage` (blue→green) reserved for hero/celebration moments (Sage archetype calm-but-bright).
- Update `src/components/ui/badge.tsx`, `src/components/ui/alert.tsx`, and `src/components/ui/toast.tsx` variants to expose `growth` for celebratory/positive system states (success messages already use emerald — keep it but route via the new token).
- Lock typography hierarchy: H1 (page title), H2 (section), H3 (subsection), body — codified in `src/components/ui/typography.tsx` (new) so pages stop hand-rolling sizes.
- Audit logo usage rules (clear space, no recoloring) into `src/components/Logo.tsx` (rename if needed) with a single canonical wrapper.

### Phase 3 — Content rewrite, batched by surface

Rewrite copy in priority order. Each batch goes in one PR-sized change so we can ship continuously.

| Batch | Surface | Files (representative) |
|------|---------|------------------------|
| 3a | Auth & onboarding | `LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `ProfileSetupPage`, `ConfirmAdminPage`, `ConfirmTeacherPage`, `ConnectDiscordPage` |
| 3b | i18n base bundle | `public/locales/en/common.json`, `src/i18n/locales/en/common.json` — sentence case nav, friendlier action verbs, add `errors.*` and `empty.*` patterns |
| 3c | Applications & journey | `ApplicationsPage`, `GeneralApplicationPage`, `MyProjectApplicationsPage`, `ProjectApplicationPage`, `MyJourneyPage`, `QuestDetailPage`, `FirstStepsPage`, `SecondStepsPage`, `ThirdStepsPage` |
| 3d | Training & resources | `TrainingPage`, `ProjectTrainingPage`, `ResourcesPage`, `ObserverCoursePage`, `DiscordCoursePage`, `VolunteerTeamsPage`, course data files in `src/data/*` |
| 3e | Admin surfaces | `AdminClassesPage`, `AdminRosterPage`, `BannerManagementPage`, `UserAdminPage`, `SystemHealthPage`, `ProjectFormPage`, `CohortFormPage`, `ClassFormPage` |
| 3f | Toasts, errors, empty states | sweep `toast.success/error` calls + `EmptyState` components; rewrite using the Phase 1 templates |
| 3g | Transactional emails | every template in `supabase/functions/_shared/transactional-email-templates/*.tsx` — subject lines, preview text, body, signatures all on-voice; Tech Fleet (two words), action-oriented CTAs |
| 3h | Policy / legal pages | `Terms`, `TermsOfUse`, `Privacy`, `Cookies`, `CodeOfConduct`, `Accessibility` — already markdown-driven; only the wrapper page titles + headings get sentence-case + brand voice intros |

Rules applied uniformly across every batch:
- "Tech Fleet" never "TechFleet".
- "people who use the platform" / "members" not "users" in user-facing copy (keep "user_id"/"users table" in code).
- "constituents" when referring to the nonprofits Tech Fleet serves; "members" for trainees.
- Sentence-case all H1/H2/H3 and button labels ("Submit application" not "SUBMIT APPLICATION" or "Submit Application").
- CTAs are verb + object ("Save draft", "Schedule interview", "View project").
- Errors follow: empathetic acknowledgment + plain reason + clear recovery action.
- Success: celebratory but appropriate ("Draft saved — pick it up anytime", not "✅ SUCCESS!!!").
- Empty states: tell the person the next action ("No applications yet — browse open projects").
- No "click here". Use descriptive link text.
- Singular "they"; capitalize "Black"/"Deaf"; never "guys"/"crazy"/"lame"/"dumb".

### Phase 4 — Guardrails so we don't drift

- ESLint custom rule (`scripts/lint/brand-terms.mjs` + `eslint.config.js`) flagging banned terms in JSX strings and i18n JSON: `TechFleet`, `click here`, `guys`, `crazy`, `lame`, `dumb`, `users` in obvious user-facing contexts (allow-listed in code paths via comment).
- Reading-level CI check: `scripts/brand/reading-level.mjs` runs Hemingway-style Flesch-Kincaid on `public/locales/**/common.json`, all `*.tsx` user-facing strings extracted, and email templates; fails CI when grade > 9 (with overrides for legal pages).
- New Playwright smoke `e2e/brand/voice.e2e.ts` — visits 10 representative routes, asserts no banned terms and that every primary CTA matches verb+object regex.
- BDD scenarios row added to `bdd_scenarios` (per project rule) covering: "When a member opens any page, Then [UI] no banned brand terms appear, [DB] page text matches `brand_voice_check` policy, [Code] reading-level lint passes."
- Update `mem://index.md` Core rules with: "Sentence case everywhere. CTAs are verb+object. Tech Fleet is two words. Use the Phase 1 voice docs for any new copy."

### Phase 5 — Imagery & illustration pass (lighter touch)

- Audit `src/assets/*` and `public/images/*` for staged stock photos; replace with diverse community-focused imagery commissioned later. Track in `docs/brand/imagery-backlog.md`.
- Generated celebration art (e.g. submitted application) gets a sage-blue→growth-green gradient pass via `imagegen` to align with the new palette.

### Phase 6 — Verification

- Manual walkthrough of the 8 highest-traffic routes (Dashboard, My Journey, Applications, Project Applications, Training, Resources, Events, Profile) confirming voice + terminology.
- CI green: brand-terms ESLint, reading-level check, Playwright voice smoke.
- Run a fresh `bdd-coverage.ts` to confirm the new scenarios are wired.

## Out of scope (intentionally)

- Full visual redesign of the dark space theme — guide explicitly endorses our blue/dark direction; we extend, not replace.
- Localized non-English bundles — i18n auto-translator continues to handle them; voice rules apply to the English source of truth and propagate.
- Logo redesign — only enforcing usage rules around the existing mark.

## Rollout order recommendation

Ship Phase 1 + 2 + 4 together (foundation + tokens + guardrails), then Phase 3a–3h batched continuously, then Phase 5 last. Total: ~8 incremental ships, no big-bang change.
