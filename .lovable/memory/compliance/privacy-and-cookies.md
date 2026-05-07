---
name: Privacy and Cookies Compliance
description: Consent-first GA4/Clarity gating, GPC honored, DSAR 30-day SLA, /privacy + /cookies + /privacy/dsar routes, retention cron, incident 72h clock
type: feature
---

## Pipeline
- GA4 + Microsoft Clarity are NEVER bootstrapped from `index.html`. They load via `src/lib/consent/loadAnalytics.ts` only after `consent.analytics === true`.
- `<CookieConsentBanner />` mounted in all 3 AppLayout branches; persists choice to `localStorage["tfn.consent.v1"]` AND `cookie_consents` table via `record-consent` edge fn.
- `navigator.globalPrivacyControl === true` forces analytics+marketing+sale_share OFF regardless of region.
- Region detection: `geo-hint` edge fn returns CF-IPCountry → opt-in default for EU/EEA/UK/CH/BR/ZA/KR/CN/CA-Quebec, opt-out elsewhere.

## Routes
- `/privacy` — Rights Center + policy markdown.
- `/cookies` — Live cookie + localStorage inspector + policy markdown.
- `/privacy/dsar` — Authenticated DSAR submission form (8 right types).
- Admin: System Health → Privacy tab (DSAR triage, 30-day SLA badges) and Incidents tab (72h regulator clock).

## Tables
- `cookie_consents` (anon_id or user_id, gpc_signal, ip_country, categories jsonb, policy_version)
- `dsar_requests` (type enum, status enum, due_at = now()+30d, decision_notes)
- `deleted_users_ledger` (sha256 of user_id, deleted_at; 24-month dispute window)
- `incident_response` (severity, affected_count, regulators[], 72h clock, draft_notification md)

## Retention cron (`enforce_retention_policy`, daily 03:10 UTC)
- Hard-purge users 24 months after delete; ledger row remains.
- Anonymize web_vital_samples / network_activity > 25 months.
- Redact email_unsubscribes > 5 years.
- audit_log untouched.
- Writes row counts to audit_log every run.

## Age gate
- DOB collected at registration; min age 13 (US default), 14 (KR/CN), 16 (EU/UK) based on `loadConsent().countryCode`.
- Stored as `profiles.birth_year` only (data minimization).

## Hardening
- ESLint: `gtag`/`clarity` may not be imported outside `src/lib/consent/`.
- CSP no longer whitelists CookieYes.
- Playwright `e2e/privacy/no-tracking-without-consent.e2e.ts` asserts 0 GA/Clarity/GTM/YouTube/Discord requests on every public route pre-consent.
- Logger redacts `consent`, `dsar`, `dob`, `birth_year`, `gpc` in addition to existing PII keys.
- Footer carries Cookie Settings + Do Not Sell or Share My Personal Information links globally.

## Runbook
`docs/compliance/privacy-runbook.md` — DSAR workflow, retention windows, breach response, quarterly audit checklist.
