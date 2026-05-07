---
name: Privacy and Cookies Compliance
description: CookieYes-driven consent + GPC override, server-side audit log, DSAR 30-day SLA, retention cron, incident 72h clock
type: feature
---

## Consent banner
- The visible cookie UI is **CookieYes** (script tag in `index.html`,
  site id `d4f48648fa538464e81930cedd3aff82`). We do not render a custom banner.
- `src/components/CookieConsentBanner.tsx` is a headless shim that:
  1. Listens for `cookieyes_consent_update` and `cookieyes_banner_load`.
  2. Maps CookieYes categories (`functional`, `analytics`/`performance`, `advertisement`) → our `ConsentState`.
  3. Calls `applyConsent()` so GA4 + Clarity load only when analytics is accepted.
  4. POSTs to `record-consent` edge fn → `cookie_consents` table for GDPR Art. 7(1) proof.
- `openCookieSettings()` calls `window.revisitCkyConsent()`; falls back to `/cookies` if blocked.
- `navigator.globalPrivacyControl === true` always wins, regardless of CookieYes state.

## Pipeline
- GA4 + Clarity NEVER bootstrap from `index.html`; they load via `src/lib/consent/loadAnalytics.ts`.
- GA4 Consent Mode v2: `analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization`, `functionality_storage`, `personalization_storage` mapped from consent.
- `geo-hint` edge fn returns CF-IPCountry for context only (CookieYes does its own region detection).

## Routes
- `/privacy` — Rights Center + policy markdown.
- `/cookies` — Live cookie + localStorage inspector + policy markdown.
- `/privacy/dsar` — Authenticated DSAR submission form (8 right types).
- Admin: System Health → Privacy tab (DSAR triage, 30-day SLA badges) and Incidents tab (72h regulator clock).

## Tables
- `cookie_consents` (anon_id or user_id, gpc_signal, ip_country, categories jsonb, policy_version, source)
- `dsar_requests` (type enum, status enum, due_at = now()+30d, decision_notes)
- `deleted_users_ledger` (sha256 of user_id, deleted_at; 24-month dispute window)
- `incident_response` (severity, affected_count, regulators[], 72h clock, draft_notification md)

## Retention cron (`enforce_retention_policy`, daily 03:10 UTC)
- Hard-purge users 24 months after delete; ledger row remains.
- Anonymize web_vital_samples / network_activity > 25 months.
- Redact email_unsubscribes > 5 years.
- audit_log untouched.

## Age gate
- DOB collected at registration; min age 13 (US default), 14 (KR/CN), 16 (EU/UK) based on `loadConsent().countryCode`.
- Stored as `profiles.birth_year` only (data minimization).

## Hardening
- ESLint: `gtag`/`clarity` may not be imported outside `src/lib/consent/`.
- CSP whitelists `cdn-cookieyes.com` + `*.cookieyes.com` for script/style/font/connect.
- Playwright `e2e/privacy/no-tracking-without-consent.e2e.ts` asserts 0 GA/Clarity/GTM/YouTube/Discord requests on every public route pre-consent (clears `cookieyes-consent` cookie + `tfn.consent.v1`).
- Logger redacts `consent`, `dsar`, `dob`, `birth_year`, `gpc` keys.
- Footer carries Cookie Settings + Do Not Sell or Share My Personal Information links globally.

## Runbook
`docs/compliance/privacy-runbook.md` — DSAR workflow, retention windows, breach response, quarterly audit checklist.
