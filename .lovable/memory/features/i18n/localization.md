---
name: Localization (any language)
description: i18next stack + AI fallback translator (translate-bundle edge fn) + i18n_translations cache + profiles.preferred_language + RTL handling.
type: feature
---
- Stack: `i18next` + `react-i18next` + `i18next-browser-languagedetector` + `i18next-http-backend`. Init in `src/i18n/index.ts`. English bundle bundled (`src/i18n/locales/en/common.json`); other static bundles served from `/public/locales/{lng}/{ns}.json`.
- Detection order: `?lang=` → localStorage `tf_lang` → navigator → htmlTag. `<html lang>` and `<html dir>` updated reactively; RTL primary subtags = ar/he/fa/ur/ps/sd/yi.
- `LanguageSwitcher` (header + mobile + public layout) lists curated featured languages plus all `Intl.DisplayNames` entries; selection persists to `profiles.preferred_language` (BCP-47 validated by trigger).
- `ensureLocale(lng, ns)` calls `translate-bundle` edge function for any locale missing a static bundle. Edge fn calls Lovable AI Gateway (`google/gemini-2.5-flash`) and caches results in `i18n_translations` (locale,namespace,key) with `machine_translated=true`. Public can read; only admins write.
- Server-side surfaces (emails, Discord, PDFs) should read `profiles.preferred_language` and use the same cache.
