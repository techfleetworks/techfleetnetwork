
# Accessibility Policy → Code Enforcement Plan (with Full i18n)

Goal: Make every commitment in `public/policies/Accessibility-Policy.md` a mechanically enforced behavior, **and** add full any-language localization across the Platform — because WCAG 3.1.1 / 3.1.2, EN 301 549 §12, and the UN CRPD all require content to be available in the user's language.

## Audit findings (current state)

Already in place:
- Skip link + single `<main>` landmark (`AppLayout.tsx`), focus ring (`index.css`).
- Idle-timeout warning hook (media-aware).
- TOTP MFA (no SMS-only) — satisfies WCAG 3.3.8.
- WCAG 2.1/2.2 A+AA checklist (`e2e/a11y/wcag-checklist.ts`), axe + DOM + static probes, weekly CI workflow `a11y-audit.yml`, `lighthouse-budget.json`.
- Web Vitals RUM beacon, `prefers-reduced-motion` honored in `App.css` (one animation only).

Gaps the policy commits to but the code does NOT enforce:
1. No dedicated **Accessibility** BDD `feature_area` (only 1 scenario today).
2. `a11y-audit.yml` is weekly + manual, not PR-blocking.
3. No `eslint-plugin-jsx-a11y`, no Pa11y runner, no explicit 24×24 target-size DOM probe.
4. No in-app `/accessibility` route or "Report a barrier / Request accommodation" form.
5. No procurement (VPAT) checklist; no training-completion record table.
6. PDF certificates and DOCX policies aren't asserted PDF/UA-tagged.
7. Reduced-motion not globally enforced across Tailwind `animate-*` and Framer Motion.
8. Live-region announcer not global (toasts only).
9. **No internationalization layer at all** — every string is hard-coded English; `<html lang>` is static; no language switcher; emails/Discord/PDF certs are English-only.

## Plan

### 1. CI gating (policy §7, §8)
- Promote `a11y-audit.yml` to run on every PR (changed-route diff) and fail on new violations vs `a11y-report.json` baseline; keep weekly full sweep.
- Add `eslint-plugin-jsx-a11y` (recommended) to `eslint.config.js`; fix surfaced issues.
- Add Pa11y runner over `e2e/a11y/routes.ts`; merge into report.
- New DOM probes: 24×24 target size, `<html lang>` matches active locale, `lang` attr on mid-content language switches, focus-visible on dynamically mounted dialogs, no positive `tabindex`.

### 2. In-app Accessibility Statement + accommodation form
- New route `/accessibility` rendering the policy via `LegalPolicyPanel` + a "Report a barrier / Request accommodation" form (page URL auto-filled, assistive tech, contact). Submits through `feedback.service.ts` with category `accessibility` → emails `info@techfleet.network` + Discord + DB row (RLS: user reads own; admins read all).
- Collapsible "Known limitations" section sourced from `docs/accessibility/known-limitations.md`.
- Linked from footer, 404 page, and idle-timeout dialog.

### 3. **Full localization (i18n) — new section**

**Library + structure**
- Add `i18next` + `react-i18next` + `i18next-browser-languagedetector` + `i18next-http-backend`.
- `src/i18n/index.ts` initializes with: detection order = `querystring` (`?lang=`) → `localStorage` (`tf_lang`) → `navigator` → `htmlTag` → fallback `en`.
- Translation files under `public/locales/{lng}/{ns}.json`, namespaces: `common`, `auth`, `dashboard`, `journey`, `applications`, `admin`, `policies`, `emails`, `errors`.
- Lazy-load locale bundles per route to keep main bundle small (Lighthouse budget compliant).

**Language coverage (any language on Earth)**
- Ship with vetted human-reviewed translations for the top 12 languages by reach: `en, es, fr, de, pt-BR, it, nl, pl, ar, zh-Hans, zh-Hant, ja, ko, hi, ru, tr, vi, id`.
- For every other language: enable an automated fallback via the existing Lovable AI gateway (`google/gemini-2.5-flash`) called from a new edge function `translate-bundle` that:
  - Accepts a target BCP-47 tag, fetches the English bundle, returns translated JSON.
  - Caches per `(lng, ns, kb_version)` in a new `i18n_translations` table (admin-only RLS, public read on translated rows). Invalidated when source English keys change.
  - Marked in UI as "machine-translated — help us improve" with a one-click feedback link to the accommodation form.
- All language tags follow BCP-47; right-to-left languages (`ar`, `he`, `fa`, `ur`) automatically set `dir="rtl"` on `<html>` and Tailwind RTL utilities (`rtl:` variants via `tailwindcss-rtl` plugin).

**Language switcher**
- Globe icon in header + footer with searchable combobox of all BCP-47 entries from `Intl.DisplayNames`. Persists to `tf_lang` cookie (so SSR-friendly later) and to `profiles.preferred_language` for signed-in users (new column, default `en`, RLS = self).
- `<html lang>` and `dir` updated reactively on switch; route changes re-announce via the live-region announcer (§5).

**Server-side surfaces**
- Edge functions read `accept-language` (or user profile) and render emails/Discord pings/PDF certificate text via the same `i18n_translations` cache.
- Email templates (React Email) accept `locale` prop; subject lines + previews translated.
- PDF certificates (`generate-certificate-pdf.ts`) embed the user's preferred language: `Lang` metadata, translated heading + body, RTL layout when needed.

**Date / number / currency**
- Replace ad-hoc `toLocaleDateString()` calls with a `formatDate(date, { locale })` util that respects the active locale and the user's timezone.
- Currency strings use `Intl.NumberFormat`.

**Source-of-truth discipline**
- ESLint rule `i18next/no-literal-string` (with allowlist for tests, debug, BDD seeds) flags any new hard-coded user-facing string.
- CI script `scripts/i18n-extract.ts` extracts keys from `t("…")` and fails the build if `en/*.json` is missing a key or has orphans.

**Policy docs**
- `scripts/gen-policies.cjs` regenerates each policy DOCX/MD per supported language (English first; auto-generated fallbacks marked machine-translated). Policy viewer in-app picks the version that matches active locale.

**WCAG ties**
- 3.1.1 Language of Page: enforced by `<html lang>` reactivity (DOM probe).
- 3.1.2 Language of Parts: `<span lang="…">` wrappers around mid-content switches (e.g., quoting another language); ESLint rule warns on suspicious unicode-block runs without `lang`.

### 4. BDD coverage (workspace rule + policy §7)
New `feature_area = "Accessibility"` with tri-layer ([UI]/[DB]/[Code]) Then-clauses, including:
- A-01 Skip link present + focusable on every route.
- A-02 Focus ring visible and not removable.
- A-03 `prefers-reduced-motion` short-circuits Framer Motion + Tailwind animations.
- A-04 Forms expose programmatic labels + inline error suggestions.
- A-05 Idle warning fires before logout, extendable in 1 click.
- A-06 TOTP MFA accepts standard authenticator codes.
- A-07 All primary controls ≥24×24 CSS px.
- A-08 Reflow at 320 CSS px without horizontal scroll.
- A-09 Color contrast ≥4.5:1 / ≥3:1 verified per route.
- A-10 Live region announces toasts + route transitions.
- A-11 Keyboard shortcuts require modifier or are user-disablable.
- A-12 `/accessibility` page reachable from every layout + 404.
- A-13 Accommodation request lands in `info@techfleet.network` + Discord + DB.
- A-14 PDF certificates are PDF/UA-tagged with `Lang`, alt text, reading order.
- A-15 DOCX policies use real heading styles + `dc:language`.
- **A-16 Switching language updates `<html lang>`, `dir`, persists to `profiles.preferred_language`, and re-renders all visible strings.**
- **A-17 RTL locales mirror layout (sidebar, breadcrumbs, icons) without horizontal scroll.**
- **A-18 Unsupported BCP-47 tag triggers `translate-bundle` fallback, caches in `i18n_translations`, and labels UI as machine-translated.**
- **A-19 Email + Discord + PDF surfaces use the user's `preferred_language`.**
- **A-20 Date/number/currency formatting respects active locale.**

Insert via migration into `bdd_scenarios`; seed automated tests under `src/test/smoke/accessibility.smoke.test.ts` + `src/test/smoke/i18n.smoke.test.ts` + Playwright probes in `e2e/a11y/`.

### 5. Reduced motion + live announcer
- Global CSS: `@media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation-duration:.001ms!important; transition-duration:.001ms!important; scroll-behavior:auto!important } }`.
- `useReducedMotionSafe()` hook for Framer Motion.
- `<LiveAnnouncer>` mounted in `AppLayout.tsx`; `useAnnounce()` for route changes + async loads (also used by §3 language switch).

### 6. Document & PDF accessibility
- `gen-policies.cjs`: emit `dc:title`, `dc:language`, structured headings, alt text on any embedded image; CI validator step.
- `generate-certificate-pdf.ts`: PDF/UA metadata (`Lang`, `Title`), tagged headings, alt text on logo, reading order, locale-aware text.

### 7. Procurement + training
- `docs/accessibility/vendor-vpat-checklist.md` + PR-template question for any new dependency/embed.
- New table `accessibility_training_completions(user_id, completed_at, version, locale)`; admin-only RLS; surfaces in `UserAdminPage` with completion %.

### 8. Database migrations
- `profiles.preferred_language text not null default 'en'` (BCP-47 validated by trigger).
- `i18n_translations(locale text, namespace text, key text, value text, source_hash text, machine_translated bool, kb_version int, primary key(locale,namespace,key))` — public read, admin write.
- `accessibility_training_completions` (above).
- `bdd_scenarios` rows for A-01…A-20.

### 9. Memory updates
- New `mem://features/accessibility/policy-enforcement.md` (PR-gated a11y suite, jsx-a11y, `/accessibility` route, accommodation form, BDD area, reduced-motion guard, certificate PDF tagging, vendor VPAT, training table).
- New `mem://features/i18n/localization.md` (i18next stack, BCP-47, `Intl.DisplayNames` switcher, RTL via `tailwindcss-rtl`, `translate-bundle` fallback + cache, server-side locale propagation to email/Discord/PDF).
- Update `mem://index.md` Core: add "Any language supported via i18next + Lovable AI fallback (`translate-bundle`); BCP-47, RTL-aware; `<html lang>`/`dir` reactive; `profiles.preferred_language` persists choice." and "`/accessibility` route renders the policy + accommodation form routed to info@techfleet.network."

## Out of scope (called out, not silently skipped)
- Manual screen-reader walkthroughs (NVDA/JAWS/VoiceOver/TalkBack) — process, scheduled in remediation plan.
- Annual third-party audit procurement — operational.
- Human translation review of every machine-translated language — ongoing community process; the UI explicitly labels machine-translated locales and invites corrections.

## Acceptance
- `a11y-audit.yml` runs on every PR, blocks on new violations.
- `bdd_scenarios` contains ≥20 rows under `feature_area = 'Accessibility'`, each with [UI]/[DB]/[Code] Thens.
- `/accessibility` route ships with working accommodation form (A-12, A-13).
- ESLint passes with `jsx-a11y/recommended` + `i18next/no-literal-string`.
- Reduced-motion globally short-circuits animations.
- Switching language: `<html lang>` + `dir` update, all UI re-renders, persists to profile, emails/PDFs follow (A-16…A-20 green).
- Memory index reflects new rules.
