## Diagnosis

Picking a language from the switcher today does:
- `i18n.changeLanguage(code)` — sets i18next state
- Persists `tf_lang` to localStorage and `profiles.preferred_language`
- Updates `<html lang>` / `<html dir>`
- Loads (or AI-translates) the `common` static bundle

But the UI doesn't change because **only 2 of ~300 component files actually call `useTranslation()`/`t()`**. Every page, header, sidebar, button, label, toast, and form is hardcoded English. So switching languages re-renders the same English strings.

The infrastructure (i18next + `translate-bundle` edge fn + `i18n_translations` cache) is solid; the wiring into UI is missing.

## Recommended approach: two layers in one PR

A pure "convert every string to t() keys" effort would touch hundreds of files and isn't realistic in one shot. We pair a fast runtime translator with a permanent key-based foundation, so users see the language change immediately while we migrate strings over time.

### Layer 1 — Permanent: convert high-traffic shells to `t()` keys

Add `useTranslation()` and replace English string literals with `t("…")` calls in the always-visible chrome. Add the matching keys to `src/i18n/locales/en/common.json` (which is what `translate-bundle` then auto-translates into every other language).

Files in scope (the things every authenticated user sees on every page):
- `src/components/AppLayout.tsx`
- `src/components/AppHeader.tsx` (or equivalent)
- `src/components/AppFooter.tsx`
- `src/components/AppSidebar.tsx` + nav group labels
- `src/components/PageHeader.tsx`
- Toast strings in `src/lib/toast.ts` (success/error/info defaults) — wrap so callers can pass either a key or a literal
- `src/pages/LoginPage.tsx` and `RegisterPage.tsx` (first-impression surfaces)
- `src/components/ErrorBoundary.tsx` recovery copy

Adds ~120 keys grouped under `nav.*`, `header.*`, `footer.*`, `auth.*`, `errors.*`, `toast.*`. `translate-bundle` already covers them at runtime for any BCP-47 tag.

### Layer 2 — Bridge: runtime DOM translation for everything else

Build `src/lib/i18n/dom-translator.ts`:
- Mounts a `MutationObserver` on `<main>` (and on portals) when `i18n.language !== "en"`.
- Walks new text nodes, collects English source strings (skip code blocks, inputs, `aria-hidden` icons, anything inside `[data-no-translate]` or `<code>`/`<pre>`/`<script>`/`<style>`).
- Looks each string up in an in-memory `Map<sourceText, translation>` keyed by `(lang, source)`.
- Cache miss → batches strings (debounced 250 ms) and posts them to a new edge function `translate-strings` (or extends `translate-bundle` with a `strings: string[]` mode), which:
  - Reads/writes the existing `i18n_translations` table with `key = sha256(source)`, `value = { source, translation }`
  - Falls back to the same Lovable AI Gateway prompt
  - Returns `{ source → translation }` map
- On response, updates the text nodes in place and stores the result in localStorage (`tf_dom_i18n:<lang>`) so reloads are instant.
- Disables itself for `lang === "en"` to keep zero overhead for English users.

Edge cases handled:
- Email addresses, URLs, numbers, identifiers (regex skip): never translated
- `data-no-translate` opt-out for brand names ("Tech Fleet", lesson IDs, code samples)
- Mixed-content nodes (e.g. `Welcome, <b>Alex</b>`) translated piecewise per text node so React state isn't disturbed
- Reduced-motion / RTL already handled by existing `dirFor` + `<html dir>` switch

### Layer 3 — Persistence + sync

- Already saved: `profiles.preferred_language` is updated on pick.
- Add an `AuthContext` boot effect: on session restore, if `profiles.preferred_language` ≠ `i18n.language`, call `ensureLocale(...)` + `i18n.changeLanguage(...)`. Today the switcher writes the preference but we don't read it back across devices.
- New table column already exists; no migration needed beyond an index check.

### Layer 4 — BDD coverage

Add Gherkin scenarios to `bdd_scenarios`:
- `I18N-RUNTIME-001` Picking Spanish translates the visible UI within 500 ms (UI: header/sidebar/footer text becomes Spanish; DB: `i18n_translations` has rows for the new strings; Code: `dom-translator` MutationObserver fires).
- `I18N-RUNTIME-002` Selecting an RTL locale flips `<html dir>` and translates text (UI: `dir="rtl"` + Arabic copy; DB: cached entries; Code: `dirFor("ar")` → `"rtl"`).
- `I18N-PERSIST-001` Sign-in on a new device restores `profiles.preferred_language` (UI: UI loads in saved language; DB: lookup of `preferred_language`; Code: AuthContext effect calls `i18n.changeLanguage`).
- `I18N-NOTRANSLATE-001` `[data-no-translate]` and brand names stay English (UI: "Tech Fleet" unchanged; DB: not stored; Code: walker skip rule).

### Layer 5 — Out of scope (followup)

- Per-page strings beyond the chrome (Journey, Training, Admin) — handled by Layer 2 at runtime, then converted to `t()` keys in followup PRs in priority order.
- Date/number/currency formatting via `Intl` (already partially in `src/lib/i18n-format.ts`).
- Right-to-left layout audit of complex grids/tables.
- Translating dynamic, user-authored content (announcements, lesson bodies) — needs separate product decision.

## Verification

1. Switch to `es` → header, sidebar, footer, login form, toasts re-render in Spanish without reload.
2. Reload → still Spanish, no flash of English (cached in localStorage `tf_dom_i18n:es`).
3. Sign out, sign in on second device → language follows from `profiles.preferred_language`.
4. Switch to `ar` → `<html dir="rtl">` and Arabic text in chrome + body.
5. Switch back to `en` → MutationObserver detaches, zero overhead.
6. `SELECT count(*) FROM i18n_translations WHERE locale='es';` grows after switch, stable on subsequent visits.

## Risks

- Runtime cost: MutationObserver on heavy pages. Mitigation: throttle, batch, skip when `lang === "en"`, opt-out attribute for hot zones (AG Grid cells via `data-no-translate` on the grid root).
- AI translation quality: surfaced via existing `language.machineTranslated` toast on first use of a non-vetted locale.
- Cache cost: every unique English string pays for one AI call per locale, then is free forever.
