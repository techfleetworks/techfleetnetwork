# Security Refactor Coverage — 2026-04-29

## Verification summary

This document records the verified coverage from the latest OWASP-focused refactor pass. It is intentionally scoped to the modules changed in this pass, not the entire platform.

## Covered modules

| Module | Files verified | OWASP coverage | Verification evidence | Status |
| --- | --- | --- | --- | --- |
| Airtable general application sync | `supabase/functions/sync-airtable/index.ts`, `supabase/functions/_shared/airtable-validation.ts`, `src/services/general-application.service.ts` | A01 Broken Access Control, A03 Injection, A05 Security Misconfiguration, A09 Security Logging/Monitoring | Requires authenticated request, accepts only UUID `application_id`, loads application server-side by `user_id`, validates Airtable base/table config, does not trust client-supplied applicant fields | Verified |
| Airtable diagnostics | `supabase/functions/airtable-diag/index.ts`, `supabase/functions/_shared/airtable-validation.ts` | A01 Broken Access Control, A05 Security Misconfiguration, A09 Sensitive Error Disclosure | Requires admin request before diagnostics, validates config, returns redacted/generic provider errors instead of raw response bodies | Verified |
| Exploration cache writes | `supabase/functions/write-exploration-cache/index.ts`, `supabase/functions/write-exploration-cache/validation.ts` | A01 Broken Access Control, A03 Injection, A05 Security Misconfiguration, A09 Sensitive Data Exposure | Requires authenticated request, validates JSON shape and query pattern, enforces 500-character query and 32KB response limits, scrubs emails/tokens/internal IDs before storage | Verified |
| RPC least privilege | `supabase/migrations/20260429041135_99335185-99f1-459e-a55b-97b08f1290de.sql` | A01 Broken Access Control, A05 Security Misconfiguration | Revokes public/anonymous execution from sensitive SECURITY DEFINER helpers, grants authenticated/service-role access explicitly, keeps only required pre-auth flows public | Verified |
| System health diagnostics | `src/services/system-health.service.ts`, `src/pages/SystemHealthPage.tsx` | A02 Data Minimization, A09 Security Logging/Monitoring | Replaces remediation wildcard projection with explicit allowlist, masks recipient email identifiers, and converts provider/database failures into safe operational guidance | Verified |
| Quest learning journey service | `src/services/quest.service.ts` | A02 Data Minimization | Replaces wildcard projections for quest paths, quest steps, and user quest selections with explicit UI-required field allowlists | Verified |
| Admin project form | `src/pages/ProjectFormPage.tsx` | A02 Data Minimization | Replaces project/client wildcard reads with explicit allowlists for editable project fields and displayed client metadata | Verified |
| Member application status | `src/pages/ProjectApplicationStatusPage.tsx` | A02 Data Minimization | Replaces wildcard reads for application, profile, general application, and notification data with explicit rendered-field allowlists | Verified |
| Member project applications list | `src/pages/MyProjectApplicationsPage.tsx` | A02 Data Minimization | Replaces listing wildcard reads with explicit application/project summary allowlists and avoids long-form response over-fetching | Verified |
| Admin submitted applications grid | `src/components/SubmittedApplicationsTab.tsx` | A02 Data Minimization | Replaces admin review wildcard reads with explicit project application, general application, project, and client allowlists | Verified |
| Member project application flow | `src/pages/ProjectApplicationPage.tsx` | A02 Data Minimization | Replaces form-flow wildcard reads with explicit project, client, profile, general application, and draft application allowlists | Verified |
| Admin clients/projects tabs | `src/components/clients/ClientsTab.tsx`, `src/components/clients/ProjectsTab.tsx` | A02 Data Minimization | Replaces admin management wildcard reads with explicit client and project allowlists | Verified |
| Admin project readiness analysis | `src/components/admin/ProjectAnalysisContent.tsx` | A02 Data Minimization | Replaces analysis wildcard reads with explicit staffing, cross-application, project, and profile allowlists while excluding long-form answers | Verified |
| Announcement banner service | `src/services/banner.service.ts` | A02 Data Minimization | Replaces admin/published banner wildcard and implicit mutation-return reads with an explicit banner allowlist and keeps dismissal reads identifier-only | Verified |
| Email unsubscribe endpoint | `supabase/functions/handle-email-unsubscribe/index.ts` | A02 Data Minimization | Replaces token wildcard lookup and broad update return with explicit email/used-at allowlists | Verified |
| Announcement service | `src/services/announcement.service.ts` | A02 Data Minimization | Replaces announcement implicit insert/read projections with explicit announcement and read-receipt allowlists | Verified |
| General application service | `src/services/general-application.service.ts` | A02 Data Minimization | Replaces repeated long-form inline projections and implicit create returns with explicit application/profile-email allowlists | Verified |
| Admin roster views | `src/pages/AdminRosterPage.tsx`, `src/pages/RosterProjectDetailPage.tsx`, `src/test/ui/AdminProjects.test.tsx` | A02 Data Minimization | Converts roster list/detail projections and stale test fixture wildcard reads to explicit allowlists | Verified |

## BDD coverage records

| Scenario ID | Purpose | Evidence |
| --- | --- | --- |
| `SEC-AIRTABLE-SYNC-006` | General application sync uses server-side ownership checks and strict identifier validation | `supabase/functions/sync-airtable/validation_test.ts` |
| `SEC-AIRTABLE-DIAG-007` | Airtable diagnostics are admin-only and avoid leaking provider internals | `supabase/functions/sync-airtable/validation_test.ts` |
| `SEC-CACHE-DLP-005` | Exploration cache validates input and redacts sensitive output | `supabase/functions/write-exploration-cache/validation_test.ts` |
| `SEC-RPC-LEAST-PRIVILEGE-004` | SECURITY DEFINER helpers are least-privilege by default | `supabase/migrations/20260429041135_99335185-99f1-459e-a55b-97b08f1290de.sql` |
| `SEC-SYSTEM-HEALTH-ERROR-DATA-MIN-042` | Admin health diagnostics minimize data and avoid raw operational error disclosure | `src/test/ui/SystemHealthPage.security.test.tsx` |
| `SEC-QUEST-SERVICE-PROJECTION-043` | Quest service avoids wildcard projections and bounds user journey selection data | `src/test/services/quest.service.security.test.ts` |
| `SEC-PROJECT-FORM-PROJECTION-044` | Admin project form avoids wildcard projections and bounds project/client fields | `src/test/ui/ProjectFormPage.security.test.tsx` |
| `SEC-APPLICATION-STATUS-PROJECTION-045` | Member application status avoids wildcard projections and bounds rendered review data | `src/test/ui/ProjectApplicationStatusPage.security.test.tsx` |
| `SEC-MY-PROJECT-APPLICATIONS-PROJECTION-046` | Member project application listing avoids wildcard projections and long-form response over-fetching | `src/test/ui/MyProjectApplicationsPage.security.test.tsx` |
| `SEC-SUBMITTED-APPLICATIONS-PROJECTION-047` | Admin submitted applications review avoids wildcard projections and unrelated metadata over-fetching | `src/test/ui/SubmittedApplicationsTab.security.test.tsx` |
| `SEC-PROJECT-APPLICATION-PROJECTION-048` | Member project application flow avoids wildcard projections and unrelated metadata over-fetching | `src/test/ui/ProjectApplicationPage.security.test.tsx` |
| `SEC-CLIENTS-PROJECTS-TABS-PROJECTION-049` | Admin clients/projects tabs avoid wildcard projections and unrelated metadata over-fetching | `src/test/ui/ClientsProjectsTabs.security.test.tsx` |
| `SEC-PROJECT-ANALYSIS-PROJECTION-050` | Admin project readiness analysis avoids wildcard projections and long-form answer over-fetching | `src/test/ui/ProjectAnalysisContent.security.test.tsx` |
| `SEC-BANNER-SERVICE-PROJECTION-051` | Announcement banner service avoids wildcard/implicit projections and keeps dismissal reads bounded | `src/test/services/banner.service.security.test.ts` |
| `SEC-EMAIL-UNSUBSCRIBE-PROJECTION-052` | Public email unsubscribe endpoint avoids wildcard token projections and metadata over-fetching | `supabase/functions/handle-email-unsubscribe/security_test.ts` |
| `SEC-ANNOUNCEMENT-SERVICE-PROJECTION-053` | Announcement service avoids wildcard/implicit projections and keeps read receipts bounded | `src/test/services/announcement.service.security.test.ts` |
| `SEC-GENERAL-APPLICATION-SERVICE-PROJECTION-054` | General application service avoids wildcard/implicit projections and keeps profile lookup email-only | `src/test/services/general-application.service.security.test.ts` |
| `SEC-ADMIN-ROSTER-PROJECTION-055` | Admin roster list/detail views avoid wildcard/implicit projections and bound project/client fields | `src/test/ui/AdminRosterProjection.security.test.tsx` |

## Targeted validation performed

- Static coverage search confirmed auth gates and validation helpers are present for the hardened functions.
- File inspection confirmed `sync-airtable` now resolves authoritative application data from the backend instead of trusting request body fields.
- File inspection confirmed `airtable-diag` is admin-gated and returns generic diagnostic errors.
- File inspection confirmed `write-exploration-cache` rejects malformed/oversized payloads and applies DLP scrubbing before storage.
- Migration inspection confirmed sensitive RPC grants were revoked from public/anonymous roles and re-granted explicitly.
- Focused UI/service tests confirm system health diagnostics avoid wildcard remediation projections, mask recipient emails, and redact raw provider/database errors.
- Focused service tests confirm quest learning journey reads use explicit projections and do not over-fetch unrelated user data.
- Focused UI source tests confirm admin project editing reads use explicit projections and avoid unrelated sensitive metadata.
- Focused UI source tests confirm member application status reads use explicit projections for application/profile/general-application/notification data.
- Focused UI source tests confirm member project application listings use explicit projections and avoid loading long-form responses.
- Focused UI source tests confirm admin submitted application review reads use explicit projections and avoid unrelated administrative/billing metadata.
- Focused UI source tests confirm member project application flow reads use explicit projections for project, client, profile, general application, and draft application data.
- Focused UI source tests confirm admin client/project tab reads use explicit projections and avoid unrelated billing/private metadata.
- Focused UI source tests confirm admin project readiness analysis uses explicit projections and avoids loading long-form application responses.
- Focused service tests confirm announcement banner reads and mutation returns use explicit projections while dismissal reads remain identifier-only.
- Focused function tests confirm the public unsubscribe endpoint reads and returns only email/used-at token fields.
- Focused service tests confirm announcement list/create/read-receipt flows use explicit projections and avoid private/device metadata over-fetching.
- Focused service tests confirm general application list/fetch/create/latest-completed reads use a shared allowlist and profile prefill reads email only.
- Focused UI source tests confirm admin roster list/detail reads use named project/application count allowlists and test fixtures no longer exercise wildcard client reads.

## Remaining security-refactor gaps

These areas still need future verification/refactor passes before claiming full-platform coverage:

1. All remaining edge functions not listed above.
2. Client-side service modules that invoke backend functions or mutate privileged data.
3. Storage upload/download policies and file validation paths.
4. Admin-only UI routes for least-privilege, data minimization, and error redaction.
5. Database RLS policy review for every table with user or admin data.
6. End-to-end negative tests for unauthorized access, malformed payloads, and rate-limit behavior.

## Coverage conclusion

The last build covered the Airtable sync/diagnostic boundary, exploration cache writes, and sensitive RPC grant posture. It did not cover every platform module, so full-system hardening remains in progress.
