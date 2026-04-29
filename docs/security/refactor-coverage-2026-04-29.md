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

## BDD coverage records

| Scenario ID | Purpose | Evidence |
| --- | --- | --- |
| `SEC-AIRTABLE-SYNC-006` | General application sync uses server-side ownership checks and strict identifier validation | `supabase/functions/sync-airtable/validation_test.ts` |
| `SEC-AIRTABLE-DIAG-007` | Airtable diagnostics are admin-only and avoid leaking provider internals | `supabase/functions/sync-airtable/validation_test.ts` |
| `SEC-CACHE-DLP-005` | Exploration cache validates input and redacts sensitive output | `supabase/functions/write-exploration-cache/validation_test.ts` |
| `SEC-RPC-LEAST-PRIVILEGE-004` | SECURITY DEFINER helpers are least-privilege by default | `supabase/migrations/20260429041135_99335185-99f1-459e-a55b-97b08f1290de.sql` |
| `SEC-SYSTEM-HEALTH-ERROR-DATA-MIN-042` | Admin health diagnostics minimize data and avoid raw operational error disclosure | `src/test/ui/SystemHealthPage.security.test.tsx` |
| `SEC-QUEST-SERVICE-PROJECTION-043` | Quest service avoids wildcard projections and bounds user journey selection data | `src/test/services/quest.service.security.test.ts` |

## Targeted validation performed

- Static coverage search confirmed auth gates and validation helpers are present for the hardened functions.
- File inspection confirmed `sync-airtable` now resolves authoritative application data from the backend instead of trusting request body fields.
- File inspection confirmed `airtable-diag` is admin-gated and returns generic diagnostic errors.
- File inspection confirmed `write-exploration-cache` rejects malformed/oversized payloads and applies DLP scrubbing before storage.
- Migration inspection confirmed sensitive RPC grants were revoked from public/anonymous roles and re-granted explicitly.
- Focused UI/service tests confirm system health diagnostics avoid wildcard remediation projections, mask recipient emails, and redact raw provider/database errors.
- Focused service tests confirm quest learning journey reads use explicit projections and do not over-fetch unrelated user data.

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
