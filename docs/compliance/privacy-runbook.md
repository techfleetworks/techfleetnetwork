# Privacy & Cookies Compliance Runbook

**Scope:** GDPR, UK GDPR, ePrivacy Directive, Swiss FADP, LGPD, PIPL, CCPA/CPRA, Quebec Law 25, POPIA.
**Owner:** info@techfleet.network — Privacy operations team.

---

## 1. Consent architecture (in-product)

- Consent state lives in `localStorage["tfn.consent.v1"]` AND is mirrored to the `cookie_consents` table via the `record-consent` edge function.
- GA4 + Microsoft Clarity are **never** injected by `index.html`. They load only from `src/lib/consent/loadAnalytics.ts` after the user grants `analytics`.
- Defaults by region (resolved via `geo-hint` edge fn → CF-IPCountry):
  - **Opt-in (banner blocks tracking until accepted):** EU/EEA, UK, CH, NO, IS, LI, BR, ZA, KR, CN, CA-Quebec.
  - **Opt-out (analytics on, easy reject):** all other jurisdictions.
- `navigator.globalPrivacyControl === true` forces `analytics=false`, `marketing=false`, `sale_share=false`, regardless of region.
- Consent version is bumped by changing `CONSENT_POLICY_VERSION` in `src/lib/consent/manager.ts`. Old consent rows remain for audit; the banner re-prompts users.

## 2. DSAR handling (30-day SLA)

| Right | Type value | Default SLA | Action |
|---|---|---|---|
| Access | `access` | 30d | Run `export_my_data` RPC, deliver ZIP via email. |
| Portability | `portability` | 30d | Same as access; format JSON + CSV. |
| Correction | `correction` | 30d | Edit profile / linked records. |
| Erasure | `erasure` | 30d | Trigger `delete-account` edge fn; ledger row written. |
| Restriction | `restrict` | 30d | Set `profiles.processing_restricted=true`; pause emails + analytics. |
| Objection | `object` | 30d | Pause marketing; document basis. |
| Appeal | `appeal` | 60d | Reset SLA, escalate to Privacy Lead. |
| Human review of automated decision | `human_review` | 30d | Manual review by Fleety operator. |

**Workflow:** request hits `/privacy/dsar` → `dsar-submit` edge fn writes `dsar_requests` row → `info@techfleet.network` email + admin Discord ping → admin triages in **System Health → Privacy** tab → close with decision notes.

## 3. Retention windows (enforced daily 03:10 UTC)

`enforce_retention_policy()` cron handles:
- Hard-purge soft-deleted users **24 months** after `delete-account`. Ledger row in `deleted_users_ledger` keeps SHA-256 of user_id for dispute window.
- Anonymize `web_vital_samples`, `network_activity`, log tables **>25 months** old (set actor/user FKs to NULL, mark `anonymized_at`).
- Redact `email_unsubscribes` rows **>5 years** old.
- `audit_log` is exempt (SOC 2 hash-chain). See `mem://compliance/audit-log-retention`.

Each run writes row counts to `audit_log` for SOC 2 / ISO 27001 evidence.

## 4. Breach response (GDPR Art. 33 — 72-hour clock)

1. Admin opens **System Health → Incidents → Open Incident**.
2. RPC `open_incident()` writes a row, starts the 72h regulator clock, and notifies all admins via Discord + email.
3. The Incidents tab generates a **draft regulator notification** (Markdown) and a **draft user email**.
4. Privacy Lead reviews & sends within 72 hours of confirmed breach detection.
5. Close incident with regulator reference numbers.

Severity → regulator list:
- EU/EEA users → lead Data Protection Authority of the relevant member state.
- UK users → ICO.
- US users → state AGs per state breach laws.
- BR users → ANPD.
- ZA users → Information Regulator.

## 5. Children & age gate

- Registration form (`RegisterPage`) requires DOB.
- Minimum age computed against `loadConsent().countryCode`:
  - EU/EEA, UK → 16.
  - KR, CN → 14.
  - US + default → 13.
- Persisted as `profiles.birth_year` only (no day/month — minimization).
- Google OAuth path is gated post-creation: under-min profile is deleted, user is shown the "We don't yet support under-X registration" screen.

## 6. Hardening checks

- ESLint forbids `import` of `gtag` / `clarity` outside `src/lib/consent/`.
- Playwright spec `e2e/privacy/no-tracking-without-consent.e2e.ts` runs in CI on every public route and fails the build if any request hits GA/Clarity/GTM/YouTube/Discord pre-consent.
- Logger redacts `consent`, `dsar`, `dob`, `birth_year`, `gpc`, plus the previously redacted PII keys.
- CSP no longer whitelists CookieYes (we use first-party consent).

## 7. Quarterly audit checklist

- [ ] Re-run Playwright `no-tracking-without-consent` suite.
- [ ] Verify `enforce_retention_policy` cron logged a row in `audit_log` every day for the last 90 days.
- [ ] Confirm DSAR queue has 0 rows past their `due_at` (or each has a documented appeal/extension).
- [ ] Spot-check 5 random `cookie_consents` rows match the region's expected default.
- [ ] Review open incidents — none stale > 72h without regulator notice.
- [ ] Confirm CSP headers present in production response (`curl -I https://techfleet.network`).
