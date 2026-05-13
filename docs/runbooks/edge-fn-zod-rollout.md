# Edge Function Zod Rollout — Phased Backlog

**Audit references:** M-01 (input validation), M-05 (CORS hygiene).

**Hard rule:** every PR ships ≤10 functions, each independently verified with `supabase--curl_edge_functions` against the exact body the current client sends. Any rejection of a previously-valid call = immediate revert.

## Per-function risk classes

### Class A — already validates manually (low priority, may not need Zod)
These already have field-by-field guards. Wrapping in Zod is cosmetic and risks regression.

- `record-consent` — typeof checks + slice() length caps
- `dsar-submit` — reads `email`, `request_type`, validated against enum
- `client-rate-limit-log` — `key`, `weight`
- `record-policy-acknowledgment` — `policy_version`, `policy_type`
- `revoke-recording-consent` — `meeting_id`
- `submit-dispute` — `decision_id`, `reason`

**Action:** skip in Zod pass. Manual guards already meet input-validation control.

### Class B — admin-gated, write-heavy (HIGH care)
Must verify every existing field still passes after Zod. All fields `.optional()` unless code path proves required.

- `admin-purge-auth-user`, `admin-sign-out-all-users`
- `promote-to-admin`, `promote-to-teacher`, `confirm-admin-role`, `confirm-teacher-role`, `revoke-teacher-role`, `revoke-user-sessions`
- `send-announcement-email`, `send-project-blast`
- `notify-applicant-status`, `notify-class-published`, `mark-interview-scheduled`
- `ingest-csv-knowledge`, `ingest-reference-csv`, `ingest-workshop-docs`
- `manage-discord-roles`, `grant-observer-role`
- `delete-account`

**Action:** 1 PR per 3-4 functions. Each PR: read every client call site → schema → curl → ship.

### Class C — webhook / signed (do NOT add origin-restricting CORS)
Signature is the auth. Body shape is dictated by upstream provider — Zod schema must match provider docs exactly.

- `discord-interactions` (Discord)
- `gumroad-webhook` (Gumroad)
- `handle-email-suppression`, `handle-email-unsubscribe` (Resend)
- `auth-email-hook` (Supabase Auth)

**Action:** schemas mirror upstream docs verbatim. Keep `Access-Control-Allow-Origin: *`.

### Class D — service-role / cron (no public callers)
Body shape controlled entirely by our own cron / NOTIFY listener. Lowest risk.

- `process-email-queue`, `process-notification-fanout`
- `quest-nudge`, `triage-digest-builder`, `triage-error`, `notify-critical-fix`
- `fleety-learning-digest`, `fleety-weekly-digest`, `fleety-bulk-draft-playbooks`, `fleety-embed`
- `gumroad-backfill`, `gumroad-reconcile`
- `refresh-community-events`
- `email-pipeline-health`
- `screen-sanctions`
- `airtable-diag`, `sync-airtable`, `sync-airtable-roster`
- `register-fleety-command`, `resend-signup-confirmations`
- `scrape-figma-workshops`, `scrape-knowledge`, `firecrawl-search`
- `fill-content-gaps`
- `write-exploration-cache`

**Action:** straightforward Zod pass — but cron callers don't always send a body. Schema = `z.object({...}).optional()` at top-level so empty POSTs still pass.

### Class E — public reads (anon-callable, no auth required)
- `public-classes`, `public-project-detail`, `public-project-openings`
- `get-community-events`, `geo-hint`
- `translate-bundle`, `translate-strings`
- `record-web-vital`
- `verify-turnstile`
- `rate-limit`
- `validate-email-domain`
- `check-account-identity`
- `login-with-captcha`
- `resolve-discord-id`
- `generate-discord-invite`
- `push-config`
- `send-push-notification`
- `preview-transactional-email` (admin only despite anon path)
- `discord-notify`, `discord-project-update`
- `fetch-class-certifications`, `fetch-project-certifications`
- `techfleet-chat`

**Action:** Zod with maximum lenience (`.passthrough()` + every field `.optional()`); never reject a previously-valid request. Add length caps on string fields to limit DoS surface.

## CORS hygiene (M-05) bundled into each PR

When a function in Class B/D/E ships its Zod schema, also:
1. Replace `Access-Control-Allow-Origin: *` with the import from `npm:@supabase/supabase-js@2/cors` (echoes request origin against Supabase allow-list).
2. Verify with curl from preview origin, custom domain, and (where applicable) localhost.
3. Class C functions keep `*` with a code comment `// signed webhook — origin not the auth boundary`.

## Verification template (paste into every PR description)

```
Functions in this PR: [list]
Per function:
- [ ] Read every client call site
- [ ] Schema fields match exactly (extras = .optional().passthrough())
- [ ] curl with current client body → 200
- [ ] curl with empty body → behavior matches main (200 or expected 400)
- [ ] curl with extra unknown field → 200 (no rejection)
- [ ] Auth gate code unchanged (diff shows zero lines in requireAuthenticatedRequest / requireAdminRequest)
- [ ] Response shape unchanged (same JSON keys)
Smoke matrix run: [link]
```

## Out of scope

- Tightening any existing schema beyond the current accepted shape.
- Removing fields.
- Changing auth gates.
- Changing response shapes.
- Any RLS / policy / DEFINER touch.
