## Audit findings vs. Privacy + Cookie Policy commitments

I read both policies in full and audited the code (`index.html`, `src/components/AnalyticsTracker.tsx`, `src/lib/policies.ts`, `supabase/functions/delete-account`, the DB, the routes, and the policy pages). The platform currently makes promises it does not keep. Highest-risk gaps, in order:

1. **GA4 + Microsoft Clarity load on every visit, with no consent.** `index.html` lines 66–86 inject `gtag('config', 'G-WYQKEKXSRR')` immediately and queue Clarity 1.5s after `load`, regardless of user/region. This violates EU/UK ePrivacy, Swiss FADP, LGPD, and PIPL — exactly what Cookie Policy §3.3, §6 promise we won't do.
2. **No cookie banner, no Cookie Settings link in the footer.** Policy §5.1 promises both.
3. **No Global Privacy Control handling.** Privacy §6.1, §15 and Cookie §5.3 promise we honor `navigator.globalPrivacyControl`.
4. **No "Do Not Sell or Share My Personal Information" link.** Privacy §6.1 promises it.
5. **No in-app `/privacy` or `/cookies` routes.** Only `.docx` downloads exist (`src/lib/policies.ts`). EU/UK/CA/BR all require easy-to-read in-product notice.
6. **No DSAR intake for access / portability / correction / restriction / objection / appeal.** Only a partial `export_my_data()` RPC and `delete-account` edge fn exist, neither exposed in UI.
7. **No consent storage.** No `user_consents` / `cookie_consents` tables; we cannot prove consent existed (GDPR Art. 7(1) burden of proof).
8. **No retention automation.** Policy §8 commits to specific windows (24mo post-deletion, 25mo analytics anon, 7yr audit) — none enforced by cron.
9. **No children's age gate** at registration; Privacy §3.5 promises 13+ (US) / 16+ (EU) gating.
10. **No automated-decision human-review request UI.** Privacy §5 promises one for Fleety/recommendations.
11. **No breach-notification runbook in code** (Privacy §14 — 72h GDPR clock).
12. **CSP already whitelists CookieYes** but CookieYes is never actually loaded; the names in the policy (e.g. `cookieyes-consent`) are aspirational.

---

## Plan: bring code in line with the policies

### Workstream 1 — Consent system (blocks 1, 2, 3, 4, 7, 12)

- **Build a first-party consent manager** (`src/lib/consent/*`). No CookieYes — keeps PII inside Lovable Cloud and lets us prove consent.
  - Categories: `strictly_necessary` (always on), `functional`, `analytics`, `marketing` (off by default in EU/UK/CH/BR/CA/Quebec/ZA; opt-out elsewhere where allowed).
  - Detect region via Cloudflare `CF-IPCountry` header surfaced by an edge function `geo-hint`; fall back to opt-in.
  - Honor `navigator.globalPrivacyControl === true` → force `analytics=false, marketing=false, sale_share=false` and surface a banner confirming.
- **`<CookieConsentBanner />`** — accessible (WCAG 2.2 AA), focus-trapped, three primary actions: Accept all / Reject non-essential / Customize. Persists choice to:
  - `localStorage` key `tfn.consent.v1` (legal: device-level memory),
  - DB table `cookie_consents` (id, user_id null-able, anon_id, ip_country, gpc_signal, categories jsonb, policy_version, ua, created_at) — written via `record-consent` edge fn so anon users can also be recorded.
- **Footer link** "Cookie Settings" + "Do Not Sell or Share My Personal Information" added globally in `AppLayout`. Clicking re-opens the manager.
- **Gate analytics**: move the GA4 + Clarity bootstrap out of `index.html` into `src/lib/consent/loadAnalytics.ts`. Only fires when `consent.analytics === true`. Wrap GA4 with `gtag('consent','default',{ ad_storage:'denied', analytics_storage:'denied' })` first, then `gtag('consent','update', …)` on accept (Google Consent Mode v2). Same gate for Clarity (`clarity('consent', false)` until accepted).
- **Stop firing `page_view` from `AnalyticsTracker.tsx` until consent is granted.**

### Workstream 2 — Privacy rights center (blocks 5, 6, 10)

- New route **`/privacy`** rendering the markdown of `Privacy-Policy.md` (same pattern as `/accessibility`), plus a **Rights Center** card with one-click actions:
  - Download my data (calls existing `export_my_data` RPC; bundle to JSON + CSV ZIP via new `export-my-data` edge fn).
  - Correct my data (deep-link to `EditProfilePage`).
  - Delete my account (existing `delete-account` fn; double-confirm modal already exists).
  - Restrict / object to processing → opens DSAR form.
  - Withdraw consent → opens Consent Manager.
  - Request human review of an automated decision (Fleety/recommendations) → opens DSAR form pre-filled.
  - Appeal a previous decision.
- New route **`/cookies`** rendering `Cookie-Policy.md` plus a live "What's set on this device" inspector (reads `document.cookie` + localStorage keys we own) — fulfills Cookie §4.
- **DSAR table** `dsar_requests` (id, user_id, type enum: access/portability/correction/erasure/restrict/object/appeal/human_review, payload jsonb, status enum: received/in_review/completed/denied/appealed, regulator_jurisdiction, due_at timestamp = now() + 30 days, created_at, completed_at, decision_notes). RLS: user reads own; admin reads all.
- New edge fn **`dsar-submit`** writes the request, sends an internal email to `info@techfleet.network`, and emails the requester an acknowledgment with their case ID + 30-day SLA.
- New admin tab **System Health → Privacy Requests** showing the queue with due dates, an Accept/Deny/Need-more-info workflow, and an Appeal button that resets the SLA.

### Workstream 3 — Retention enforcement (block 8)

- New cron (pg_cron, daily 03:00 UTC) `enforce_retention_policy()`:
  - Hard-delete `profiles` + cascading user data **24 months** after a `delete-account` event (currently we delete immediately — we keep a `deleted_users` ledger row with hashed id for the 24mo dispute window per Policy §8).
  - Anonymize analytics: rotate `web_vital_samples.user_id`, `network_activity.actor_id`, etc. older than **25 months** to `NULL` and add `anonymized_at`.
  - Marketing suppression list: rows in `email_unsubscribes` retained 5 years then anonymized.
  - **Audit log untouched** (existing carve-out memory).
- Each run logs to `audit_log` with the row counts so SOC 2 / ISO 27001 evidence is intact.

### Workstream 4 — Children, automated decisions, breach (blocks 9, 10, 11)

- Registration form gains a **date-of-birth** field; submit blocked when computed age < 13 (US default). For users with `ip_country` in EEA/UK → block < 16; KR/CN → < 14. Stored as `profiles.birth_year` only (minimize). Parental-consent flow defers actual capture (out of scope for this pass; gate the path with a friendly "we don't yet support under-X registration" screen).
- **Fleety + recommendation surfaces** get an "About this suggestion" link → opens a dialog explaining the inputs and a "Request human review" button (writes a `dsar_requests` row, type=`human_review`).
- **Breach runbook**: new `incident_response` table + `report-incident` admin-only edge fn that:
  - Tags severity, affected user count, regulator list.
  - Starts the GDPR 72-hour clock visibly in System Health.
  - Generates a draft regulator notification (markdown) and a draft user email.
  - Notifies all admins via Discord + email immediately.

### Workstream 5 — International transfer + region notices

- Add `<RegionalPrivacyNotice />` to the consent banner's "Customize" panel showing the user's detected region and the lawful transfer mechanism (SCCs / UK IDTA / DPF) — fulfills Privacy §7.
- Add `/privacy/transfers` static page summarizing safeguards with a "Request copy of safeguards" button (DSAR type=`access`, scope=`transfers`).

### Workstream 6 — Source-code & infra hardening

- **CSP**: keep CookieYes domains for now (we may reintroduce); add a comment noting analytics scripts are runtime-gated. Add `Permissions-Policy: interest-cohort=(), browsing-topics=()` header (already partially present) to disable Topics API.
- **No third-party requests before consent** — verified by a Playwright spec `e2e/privacy/no-tracking-without-consent.e2e.ts` that loads every public route and asserts the network log contains no requests to `*.google-analytics.com`, `*.clarity.ms`, `*.googletagmanager.com`, `youtube.com`, `discord.com` until consent is granted.
- **ESLint rule** banning `import` of `gtag`/`clarity` outside `src/lib/consent/`.
- **Logger**: ensure `logger.service.ts` already-present PII redaction list adds `consent`, `dsar`, `dob`/`birth_year`. Verify in `security.test.ts`.

### Workstream 7 — BDD scenarios (workspace rule)

Add ≥15 scenarios under `feature_area = 'Privacy & Cookies'` (new `feature_area_number`), each with [UI]/[DB]/[Code] Then-clauses, e.g.:

- `PRIV-CONSENT-DEFAULT-EU` — EU visitor sees banner; analytics not loaded; `cookie_consents` row written with denied categories.
- `PRIV-GPC-HONORED` — Browser sends `Sec-GPC: 1`; analytics + sale/share forced off; `gpc_signal=true` recorded.
- `PRIV-DSAR-ACCESS-30D` — User submits access request; due_at = now() + 30d; admin sees row; SLA badge visible.
- `PRIV-RETENTION-24MO` — Account deleted 24+ months ago is hard-purged by cron; ledger keeps hashed id.
- `PRIV-CHILD-EU-BLOCKED` — Under-16 EU registration is rejected before any DB write.
- `PRIV-HUMAN-REVIEW` — User clicks "Request human review" on a Fleety reply; DSAR row type=`human_review` created.
- `PRIV-BREACH-72H` — Admin opens an incident; countdown visible; draft regulator email generated.
- `PRIV-COOKIE-INSPECTOR` — `/cookies` lists every cookie + localStorage key we set, with category and lifetime.

### Workstream 8 — Memory + docs

- New memory file `mem://compliance/privacy-and-cookies` summarizing the consent-first pipeline, GPC handling, DSAR SLAs, and retention windows; add to Core a one-liner: "No third-party trackers may load before consent; GPC = automatic deny; DSAR SLA = 30 days; retention windows enforced by daily cron."
- `docs/compliance/privacy-runbook.md` — admin playbook for DSARs and breach response.

---

## File-level changes

```text
index.html                                    remove inline GA4/Clarity bootstrap (consent-gated load only)
src/lib/consent/manager.ts                    NEW — consent state, GPC detection, region detection
src/lib/consent/loadAnalytics.ts              NEW — gated GA4 + Clarity loaders w/ Consent Mode v2
src/components/CookieConsentBanner.tsx        NEW — accessible 3-action banner + customize panel
src/components/PrivacyFooterLinks.tsx         NEW — Cookie Settings + Do Not Sell/Share + Privacy + Cookies
src/components/AppLayout.tsx                  mount banner + footer links
src/components/AnalyticsTracker.tsx           gate page_view on consent.analytics
src/pages/PrivacyPage.tsx                     NEW — markdown render + Rights Center
src/pages/CookiesPage.tsx                     NEW — markdown render + live cookie inspector
src/pages/DsarSubmitPage.tsx                  NEW — DSAR form (all 8 right types)
src/pages/admin/PrivacyRequestsPage.tsx       NEW — admin queue
src/pages/RegisterPage.tsx                    add DOB + region-aware age gate
src/lib/policies.ts                           add /privacy + /cookies in-app routes
supabase/migrations/<ts>_privacy_compliance.sql  NEW — cookie_consents, dsar_requests, deleted_users_ledger, incident_response, retention cron, RLS
supabase/functions/record-consent/index.ts    NEW
supabase/functions/dsar-submit/index.ts       NEW
supabase/functions/export-my-data/index.ts    NEW (wraps export_my_data RPC + ZIP)
supabase/functions/report-incident/index.ts   NEW
supabase/functions/geo-hint/index.ts          NEW (returns CF-IPCountry only)
e2e/privacy/no-tracking-without-consent.e2e.ts NEW
docs/compliance/privacy-runbook.md            NEW
mem://compliance/privacy-and-cookies          NEW
```

## Acceptance criteria

- Loading any public route from a fresh browser produces **zero** network requests to GA4, Clarity, GTM, or any third party until consent is given (Playwright proves it).
- `Sec-GPC: 1` browsers see the banner pre-set to "Reject non-essential" and `cookie_consents.gpc_signal = true` on first visit.
- Footer on every page shows working "Cookie Settings", "Do Not Sell or Share My Personal Information", "Privacy Policy", "Cookie Policy".
- DSAR form submission creates a `dsar_requests` row, emails acknowledgement within 60s, and appears in the admin queue with a 30-day SLA badge.
- `/privacy` and `/cookies` render the policy markdown and pass the existing `wcag-audit` suite.
- `enforce_retention_policy` cron runs daily and writes its row counts to `audit_log`.
- EU/UK registration with DOB making user < 16 is blocked before any DB write.
- New BDD scenarios visible in `bdd_scenarios` under `feature_area = 'Privacy & Cookies'`.
- Memory index updated; Core line added.

I'd recommend shipping in three pushes: (1) Workstream 1 + 2 + 5 (the user-visible compliance bar), (2) Workstream 3 + 4 (retention + DSAR backend + breach), (3) Workstream 6 + 7 + 8 (hardening, BDD, docs). Approve and I'll start with push 1.
