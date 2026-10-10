# Edge function 100% coverage sweep

Generated 2026-10-10T04:02:56.653Z over `C:/Users/morga/Documents/tfn-audit/supabase/functions`

**Total function dirs:** 125 · **serving (has index.ts):** 125

## Aggregate coverage

- serving index.ts: **125/125 dirs**
- audit-wrapped: **125/125 (100%)**
- CORS from _shared/http: **70/125 (56%)**
- inline CORS header (any): **49/125 (39%)**
- inline CORS but NOT shared (drift risk): **48/125 (38%)**
- reads SERVICE_ROLE_KEY directly: **92/125 (74%)**
- uses shared admin-client: **22/125 (18%)**
- service-role direct AND no shared admin-client: **87/125 (70%)**
- uses shared auth predicate: **8/125 (6%)**
- hand-rolled role check (user_roles/has_role inline): **43/125 (34%)**
- possible error-message/stack in response: **61/125 (49%)**
- no top-level try/catch: **12/125 (10%)**

## Outliers (deserve manual review)

### NOT audit-wrapped — 0
_(none)_

### inline CORS NOT from shared owner — 48
- `admin-purge-auth-user`
- `admin-sign-out-all-users`
- `auth-email-hook`
- `auth-reset-smoke`
- `bump-email-warmup`
- `client-rate-limit-log`
- `email-dispatcher`
- `email-octopus-sync`
- `email-pipeline-health`
- `environment-readiness`
- `fleety-extract`
- `fleety-learning-digest`
- `fleety-review`
- `fleety-weekly-digest`
- `geo-hint`
- `get-i18n-bundle`
- `guide-ingest`
- `gumroad-backfill-all`
- `gumroad-webhook`
- `handoff-download`
- `handoff-produce`
- `handoff-submit`
- `notify-class-published`
- `notify-critical-fix`
- `preview-transactional-email`
- `process-notification-fanout`
- `promote-to-admin`
- `public-classes`
- `public-project-detail`
- `public-project-openings`
- `push-config`
- `quest-nudge`
- `rate-limit`
- `record-auth-recovery`
- `record-web-vital`
- `refresh-community-events`
- `refresh-email-health`
- `register-fleety-command`
- `register-support-command`
- `resend-signup-confirmations`
- `resume-application-reminder`
- `revoke-user-sessions`
- `save-form-draft`
- `seed-content`
- `send-application-confirmation`
- `send-push-notification`
- `spf-sync`
- `techfleet-chat`

### reads service-role key directly (no shared admin-client) — 87
- `admin-purge-auth-user`
- `admin-sign-out-all-users`
- `auth-broker`
- `auth-email-hook`
- `auth-prober`
- `auth-reset-smoke`
- `backfill-discord-usernames`
- `bump-email-warmup`
- `check-account-identity`
- `confirm-admin-role`
- `confirm-teacher-role`
- `delete-account`
- `discord-interactions`
- `discord-project-update`
- `edge-deploy-smoke`
- `email-octopus-sync`
- `email-pipeline-health`
- `environment-readiness`
- `eo-contact-status`
- `fetch-class-certifications`
- `fetch-project-certifications`
- `fill-content-gaps`
- `fleety-embed`
- `fleety-learning-digest`
- `fleety-review`
- `fleety-weekly-digest`
- `framework-csv-fetch`
- `generate-discord-invite`
- `get-community-events`
- `get-discord-member-count`
- `get-i18n-bundle`
- `grant-observer-role`
- `guide-ingest`
- `handle-email-suppression`
- `handoff-download`
- `handoff-produce`
- `handoff-submit`
- `handoff-worker`
- `ingest-csv-knowledge`
- `ingest-reference-csv`
- `ingest-workshop-docs`
- `login-with-captcha`
- `manage-discord-roles`
- `mark-interview-scheduled`
- `notify-applicant-status`
- `notify-class-published`
- `notify-critical-fix`
- `prewarm-ugc-worker`
- `process-email-queue`
- `process-notification-fanout`
- `promote-to-admin`
- `promote-to-teacher`
- `quest-nudge`
- `rate-limit`
- `reap-class-module-orphans`
- `reconcile-stuck-emails`
- `record-auth-event`
- `record-auth-recovery`
- `record-auth-wedge`
- `record-consent`
- `record-web-vital`
- `refresh-community-events`
- `refresh-email-health`
- `register-fleety-command`
- `register-support-command`
- `repair-discord-username`
- `replay-dlq-emails`
- `replay-email-dlq`
- `resend-signup-confirmations`
- `resend-webhook`
- `resume-application-reminder`
- `revoke-teacher-role`
- `revoke-user-sessions`
- `scrape-figma-workshops`
- `seed-content`
- `send-announcement-email`
- `send-application-confirmation`
- `send-community-agreement-trigger`
- `send-magic-link`
- `send-project-blast`
- `send-push-notification`
- `send-transactional-email`
- `spf-sync`
- `techfleet-chat`
- `translate-bundle`
- `translate-strings`
- `triage-error`

### hand-rolled role check (not shared predicate) — 40
- `admin-purge-auth-user`
- `admin-sign-out-all-users`
- `backfill-discord-usernames`
- `confirm-admin-role`
- `confirm-teacher-role`
- `discord-project-update`
- `environment-readiness`
- `fill-content-gaps`
- `fleety-embed`
- `fleety-learning-digest`
- `fleety-weekly-digest`
- `framework-csv-fetch`
- `guide-ingest`
- `gumroad-backfill-all`
- `handoff-download`
- `handoff-produce`
- `handoff-submit`
- `ingest-csv-knowledge`
- `ingest-reference-csv`
- `ingest-workshop-docs`
- `manage-discord-roles`
- `mark-interview-scheduled`
- `notify-applicant-status`
- `notify-class-published`
- `notify-critical-fix`
- `process-notification-fanout`
- `promote-to-admin`
- `promote-to-teacher`
- `register-fleety-command`
- `register-support-command`
- `replay-dlq-emails`
- `revoke-teacher-role`
- `revoke-user-sessions`
- `scrape-figma-workshops`
- `send-announcement-email`
- `send-community-agreement-trigger`
- `send-project-blast`
- `spf-sync`
- `techfleet-chat`
- `triage-error`

### possible error-message/stack leak in a response — 61
- `admin-sign-out-all-users`
- `auth-email-hook`
- `auth-reset-smoke`
- `bump-email-warmup`
- `discord-interactions`
- `dsar-submit`
- `email-octopus-sync`
- `email-pipeline-health`
- `fetch-class-certifications`
- `fetch-project-certifications`
- `fill-content-gaps`
- `finalize-password-reset`
- `fleety-embed`
- `fleety-learning-digest`
- `framework-csv-fetch`
- `freescout-proxy`
- `generate-discord-invite`
- `get-i18n-bundle`
- `grant-observer-role`
- `guide-ingest`
- `gumroad-backfill`
- `gumroad-backfill-all`
- `gumroad-reconcile`
- `gumroad-webhook`
- `handle-email-suppression`
- `handoff-worker`
- `ingest-csv-knowledge`
- `ingest-reference-csv`
- `ingest-workshop-docs`
- `mark-interview-scheduled`
- `notify-applicant-status`
- `preview-transactional-email`
- `prewarm-ugc-worker`
- `process-email-queue`
- `process-freescout-events`
- `process-notification-fanout`
- `quest-nudge`
- `rate-limit`
- `reap-class-module-orphans`
- `reconcile-stuck-emails`
- `record-auth-recovery`
- `record-auth-wedge`
- `record-consent`
- `record-policy-acknowledgment`
- `record-web-vital`
- `refresh-community-events`
- `refresh-email-health`
- `resend-signup-confirmations`
- `resume-application-reminder`
- `save-form-draft`
- `scrape-figma-workshops`
- `seed-content`
- `send-application-confirmation`
- `send-community-agreement-trigger`
- `send-magic-link`
- `send-push-notification`
- `sign-out-all-devices`
- `spf-sync`
- `submit-dispute`
- `support-monthly-report`
- `techfleet-chat`

### no top-level try/catch — 12
- `admin-sign-out-all-users`
- `bump-email-warmup`
- `email-dispatcher`
- `eo-contact-status`
- `fleety-weekly-digest`
- `geo-hint`
- `gumroad-reconcile`
- `handoff-download`
- `handoff-produce`
- `push-config`
- `reap-class-module-orphans`
- `reconcile-stuck-emails`

### dirs with NO serving index.ts — 0
_(none)_

### dirs with NO serving index.ts — 0
_(none)_

## Full per-function matrix

| function | loc | audit | cors-shared | cors-inline | srvrole-direct | admin-client | auth-shared | handrolled-role | err-leak? | try/catch |
|---|--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| admin-purge-auth-user | 205 | ✅ | · | ✅ | ✅ | · | · | ✅ | · | ✅ |
| admin-sign-out-all-users | 82 | ✅ | · | ✅ | ✅ | · | · | ✅ | ✅ | · |
| auth-broker | 670 | ✅ | ✅ | · | ✅ | · | · | · | · | ✅ |
| auth-email-hook | 344 | ✅ | · | ✅ | ✅ | · | · | · | ✅ | ✅ |
| auth-prober | 224 | ✅ | · | · | ✅ | · | · | · | · | ✅ |
| auth-reset-smoke | 157 | ✅ | · | ✅ | ✅ | · | · | · | ✅ | ✅ |
| backfill-discord-usernames | 208 | ✅ | ✅ | · | ✅ | · | · | ✅ | · | ✅ |
| bump-email-warmup | 90 | ✅ | · | ✅ | ✅ | · | · | · | ✅ | · |
| check-account-identity | 204 | ✅ | ✅ | · | ✅ | · | · | · | · | ✅ |
| client-rate-limit-log | 92 | ✅ | · | ✅ | · | · | · | · | · | ✅ |
| confirm-admin-role | 150 | ✅ | ✅ | · | ✅ | · | · | ✅ | · | ✅ |
| confirm-teacher-role | 144 | ✅ | ✅ | · | ✅ | · | · | ✅ | · | ✅ |
| delete-account | 106 | ✅ | ✅ | · | ✅ | · | · | · | · | ✅ |
| discord-interactions | 465 | ✅ | · | · | ✅ | · | · | · | ✅ | ✅ |
| discord-notify | 161 | ✅ | ✅ | · | · | ✅ | ✅ | · | · | ✅ |
| discord-oauth-callback | 354 | ✅ | ✅ | · | · | ✅ | ✅ | · | · | ✅ |
| discord-oauth-start | 90 | ✅ | ✅ | · | · | ✅ | ✅ | · | · | ✅ |
| discord-project-update | 251 | ✅ | ✅ | · | ✅ | · | · | ✅ | · | ✅ |
| dsar-submit | 82 | ✅ | ✅ | · | · | · | · | · | ✅ | ✅ |
| edge-deploy-smoke | 103 | ✅ | · | · | ✅ | · | · | · | · | ✅ |
| email-dispatcher | 36 | ✅ | · | ✅ | · | · | · | · | · | · |
| email-octopus-sync | 86 | ✅ | · | ✅ | ✅ | · | · | · | ✅ | ✅ |
| email-pipeline-health | 194 | ✅ | · | ✅ | ✅ | · | · | · | ✅ | ✅ |
| environment-readiness | 105 | ✅ | · | ✅ | ✅ | · | · | ✅ | · | ✅ |
| eo-contact-status | 65 | ✅ | ✅ | · | ✅ | · | · | · | · | · |
| fetch-class-certifications | 321 | ✅ | ✅ | · | ✅ | · | · | · | ✅ | ✅ |
| fetch-project-certifications | 318 | ✅ | ✅ | · | ✅ | · | · | · | ✅ | ✅ |
| fill-content-gaps | 231 | ✅ | ✅ | · | ✅ | · | · | ✅ | ✅ | ✅ |
| finalize-password-reset | 124 | ✅ | ✅ | · | · | ✅ | ✅ | · | ✅ | ✅ |
| firecrawl-search | 132 | ✅ | ✅ | · | · | · | · | · | · | ✅ |
| fleety-embed | 390 | ✅ | ✅ | · | ✅ | · | · | ✅ | ✅ | ✅ |
| fleety-extract | 284 | ✅ | · | ✅ | · | · | · | · | · | ✅ |
| fleety-learning-digest | 437 | ✅ | · | ✅ | ✅ | · | · | ✅ | ✅ | ✅ |
| fleety-review | 196 | ✅ | · | ✅ | ✅ | · | · | · | · | ✅ |
| fleety-weekly-digest | 121 | ✅ | · | ✅ | ✅ | · | · | ✅ | · | · |
| framework-csv-fetch | 103 | ✅ | ✅ | · | ✅ | · | · | ✅ | ✅ | ✅ |
| freescout-provision-admin | 125 | ✅ | ✅ | · | · | ✅ | ✅ | ✅ | · | ✅ |
| freescout-provision-customer | 98 | ✅ | ✅ | · | · | ✅ | · | · | · | ✅ |
| freescout-proxy | 555 | ✅ | ✅ | · | · | ✅ | ✅ | ✅ | ✅ | ✅ |
| freescout-sync-customer | 97 | ✅ | ✅ | · | · | ✅ | · | · | · | ✅ |
| freescout-validate-secret | 109 | ✅ | ✅ | · | · | ✅ | ✅ | ✅ | · | ✅ |
| freescout-webhook | 97 | ✅ | ✅ | · | · | ✅ | · | · | · | ✅ |
| generate-discord-invite | 265 | ✅ | ✅ | · | ✅ | · | · | · | ✅ | ✅ |
| geo-hint | 27 | ✅ | · | ✅ | · | · | · | · | · | · |
| get-community-events | 173 | ✅ | ✅ | · | ✅ | · | · | · | · | ✅ |
| get-discord-member-count | 126 | ✅ | ✅ | · | ✅ | · | · | · | · | ✅ |
| get-i18n-bundle | 120 | ✅ | · | ✅ | ✅ | · | · | · | ✅ | ✅ |
| grant-observer-role | 360 | ✅ | ✅ | · | ✅ | · | · | · | ✅ | ✅ |
| guide-ingest | 188 | ✅ | · | ✅ | ✅ | · | · | ✅ | ✅ | ✅ |
| gumroad-backfill | 323 | ✅ | ✅ | · | ✅ | ✅ | · | · | ✅ | ✅ |
| gumroad-backfill-all | 364 | ✅ | · | ✅ | ✅ | ✅ | · | ✅ | ✅ | ✅ |
| gumroad-reconcile | 101 | ✅ | ✅ | · | ✅ | ✅ | · | · | ✅ | · |
| gumroad-webhook | 273 | ✅ | · | ✅ | ✅ | ✅ | · | · | ✅ | ✅ |
| handle-email-suppression | 165 | ✅ | · | · | ✅ | · | · | · | ✅ | ✅ |
| handle-email-unsubscribe | 124 | ✅ | ✅ | · | · | ✅ | · | · | · | ✅ |
| handoff-download | 95 | ✅ | · | ✅ | ✅ | · | · | ✅ | · | · |
| handoff-produce | 186 | ✅ | · | ✅ | ✅ | · | · | ✅ | · | · |
| handoff-submit | 178 | ✅ | · | ✅ | ✅ | · | · | ✅ | · | ✅ |
| handoff-worker | 165 | ✅ | · | · | ✅ | · | · | · | ✅ | ✅ |
| ingest-csv-knowledge | 251 | ✅ | ✅ | · | ✅ | · | · | ✅ | ✅ | ✅ |
| ingest-reference-csv | 682 | ✅ | ✅ | · | ✅ | · | · | ✅ | ✅ | ✅ |
| ingest-workshop-docs | 241 | ✅ | ✅ | · | ✅ | · | · | ✅ | ✅ | ✅ |
| login-with-captcha | 276 | ✅ | ✅ | · | ✅ | · | · | · | · | ✅ |
| manage-discord-roles | 481 | ✅ | ✅ | · | ✅ | · | · | ✅ | · | ✅ |
| mark-interview-scheduled | 327 | ✅ | ✅ | · | ✅ | · | · | ✅ | ✅ | ✅ |
| notify-applicant-status | 759 | ✅ | ✅ | · | ✅ | · | · | ✅ | ✅ | ✅ |
| notify-class-published | 163 | ✅ | · | ✅ | ✅ | · | · | ✅ | · | ✅ |
| notify-critical-fix | 134 | ✅ | · | ✅ | ✅ | · | · | ✅ | · | ✅ |
| preview-transactional-email | 103 | ✅ | · | ✅ | · | · | · | · | ✅ | ✅ |
| prewarm-ugc-worker | 230 | ✅ | ✅ | · | ✅ | · | · | · | ✅ | ✅ |
| process-email-queue | 738 | ✅ | · | · | ✅ | · | · | · | ✅ | ✅ |
| process-freescout-events | 266 | ✅ | ✅ | · | · | ✅ | · | · | ✅ | ✅ |
| process-notification-fanout | 103 | ✅ | · | ✅ | ✅ | · | · | ✅ | ✅ | ✅ |
| promote-to-admin | 304 | ✅ | · | ✅ | ✅ | · | · | ✅ | · | ✅ |
| promote-to-teacher | 258 | ✅ | ✅ | · | ✅ | · | · | ✅ | · | ✅ |
| public-classes | 101 | ✅ | · | ✅ | · | · | · | · | · | ✅ |
| public-project-detail | 154 | ✅ | · | ✅ | · | ✅ | · | · | · | ✅ |
| public-project-openings | 134 | ✅ | · | ✅ | · | ✅ | · | · | · | ✅ |
| push-config | 26 | ✅ | · | ✅ | · | · | · | · | · | · |
| quest-nudge | 152 | ✅ | · | ✅ | ✅ | · | · | · | ✅ | ✅ |
| rate-limit | 151 | ✅ | · | ✅ | ✅ | · | · | · | ✅ | ✅ |
| reap-class-module-orphans | 78 | ✅ | ✅ | · | ✅ | · | · | · | ✅ | · |
| reconcile-stuck-emails | 51 | ✅ | ✅ | · | ✅ | · | · | · | ✅ | · |
| record-auth-event | 100 | ✅ | ✅ | · | ✅ | · | · | · | · | ✅ |
| record-auth-recovery | 186 | ✅ | · | ✅ | ✅ | · | · | · | ✅ | ✅ |
| record-auth-wedge | 166 | ✅ | ✅ | · | ✅ | · | · | · | ✅ | ✅ |
| record-consent | 115 | ✅ | ✅ | · | ✅ | · | · | · | ✅ | ✅ |
| record-policy-acknowledgment | 66 | ✅ | ✅ | · | · | · | · | · | ✅ | ✅ |
| record-web-vital | 231 | ✅ | · | ✅ | ✅ | · | · | · | ✅ | ✅ |
| refresh-community-events | 639 | ✅ | · | ✅ | ✅ | · | · | · | ✅ | ✅ |
| refresh-email-health | 162 | ✅ | · | ✅ | ✅ | · | · | · | ✅ | ✅ |
| register-fleety-command | 125 | ✅ | · | ✅ | ✅ | · | · | ✅ | · | ✅ |
| register-support-command | 130 | ✅ | · | ✅ | ✅ | · | · | ✅ | · | ✅ |
| repair-discord-username | 202 | ✅ | ✅ | · | ✅ | · | · | · | · | ✅ |
| replay-dlq-emails | 493 | ✅ | ✅ | · | ✅ | · | · | ✅ | · | ✅ |
| replay-email-dlq | 131 | ✅ | ✅ | · | ✅ | · | · | · | · | ✅ |
| resend-signup-confirmations | 332 | ✅ | · | ✅ | ✅ | · | · | · | ✅ | ✅ |
| resend-webhook | 136 | ✅ | · | · | ✅ | · | · | · | · | ✅ |
| resume-application-reminder | 154 | ✅ | · | ✅ | ✅ | · | · | · | ✅ | ✅ |
| revoke-recording-consent | 67 | ✅ | ✅ | · | · | · | · | · | · | ✅ |
| revoke-teacher-role | 103 | ✅ | ✅ | · | ✅ | · | · | ✅ | · | ✅ |
| revoke-user-sessions | 77 | ✅ | · | ✅ | ✅ | · | · | ✅ | · | ✅ |
| save-form-draft | 162 | ✅ | · | ✅ | · | · | · | · | ✅ | ✅ |
| scrape-figma-workshops | 379 | ✅ | ✅ | · | ✅ | · | · | ✅ | ✅ | ✅ |
| screen-sanctions | 77 | ✅ | ✅ | · | · | · | · | · | · | ✅ |
| seed-content | 134 | ✅ | · | ✅ | ✅ | · | · | · | ✅ | ✅ |
| send-announcement-email | 279 | ✅ | ✅ | · | ✅ | · | · | ✅ | · | ✅ |
| send-application-confirmation | 281 | ✅ | · | ✅ | ✅ | · | · | · | ✅ | ✅ |
| send-community-agreement-trigger | 240 | ✅ | ✅ | ✅ | ✅ | · | · | ✅ | ✅ | ✅ |
| send-magic-link | 138 | ✅ | ✅ | · | ✅ | · | · | · | ✅ | ✅ |
| send-project-blast | 382 | ✅ | ✅ | · | ✅ | · | · | ✅ | · | ✅ |
| send-push-notification | 140 | ✅ | · | ✅ | ✅ | · | · | · | ✅ | ✅ |
| send-transactional-email | 97 | ✅ | ✅ | · | ✅ | · | · | · | · | ✅ |
| sign-out-all-devices | 147 | ✅ | ✅ | · | · | ✅ | ✅ | · | ✅ | ✅ |
| spf-sync | 272 | ✅ | · | ✅ | ✅ | · | · | ✅ | ✅ | ✅ |
| submit-dispute | 74 | ✅ | ✅ | · | · | · | · | · | ✅ | ✅ |
| support-monthly-report | 40 | ✅ | ✅ | · | · | ✅ | · | · | ✅ | ✅ |
| support-provisioning-retry | 129 | ✅ | ✅ | · | · | ✅ | · | · | · | ✅ |
| techfleet-chat | 2491 | ✅ | · | ✅ | ✅ | · | · | ✅ | ✅ | ✅ |
| translate-bundle | 176 | ✅ | ✅ | · | ✅ | · | · | · | · | ✅ |
| translate-strings | 198 | ✅ | ✅ | · | ✅ | · | · | · | · | ✅ |
| triage-error | 302 | ✅ | ✅ | · | ✅ | · | · | ✅ | · | ✅ |
| validate-email-domain | 64 | ✅ | ✅ | · | · | · | · | · | · | ✅ |
| verify-turnstile | 104 | ✅ | ✅ | · | · | · | · | · | · | ✅ |
| write-exploration-cache | 74 | ✅ | ✅ | · | ✅ | ✅ | · | · | · | ✅ |
