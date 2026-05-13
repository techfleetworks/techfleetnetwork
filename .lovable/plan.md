# Audit Remediation Plan — Zero-Brick Guarantee

## Hard guardrails (non-negotiable)

1. **No RLS policy changes.** No `CREATE/DROP/ALTER POLICY`. No `ALTER TABLE ... ENABLE/DISABLE ROW LEVEL SECURITY`. No `GRANT`/`REVOKE`. No role drops.
2. **No `SECURITY DEFINER` function changes** (the 27 documented ones, including `has_role`, stay byte-for-byte identical).
3. **No `service_role` key handling changes** — admin client (`getAdminClient`) untouched.
4. **No edge-function auth gate changes** (`requireAuthenticatedRequest`, `requireAdminRequest` untouched).
5. **No changes to `src/integrations/supabase/client.ts` or `types.ts`.**
6. **No migrations in this remediation pass.** Every fix is frontend code, edge-fn input parsing, or static config.
7. **Verification gate before merge:** dry-run on preview, then run the existing pentest workflow (`scripts/pentest/db-rls.mjs`) plus a smoke matrix (admin/teacher/member CRUD on profile, announcement, class, project application) to prove nothing regressed.

If any planned step would touch items 1–5, it is dropped from this pass and re-scoped to a separate, explicitly-approved migration.

## Permission preservation matrix (snapshot to verify against post-fix)

| Role | Reads | Creates | Updates | Deletes | Must still work after fix |
|---|---|---|---|---|---|
| anon | public landing, public project openings, policy pages, signup, login, password reset, DSAR submit | account (signup), DSAR request, feedback (public form), application draft after signup | own session tokens | none | yes |
| member | own profile, own journey, own classes, announcements, events, resources, notifications, own applications, framework KB, Fleety chat | own profile, own application, own feedback, own quest progress, own push subscription, own avatar upload | own profile, own application (pre-submit), own preferences, own notification read-state | own application (draft), own avatar, own notifications, own account | yes |
| teacher | everything member can + own classes & cohorts roster, own class submissions queue | own classes, own cohorts, class announcements | own classes, own cohorts (pre-approval) | own draft classes/cohorts | yes |
| admin | every table via `has_role()` policies, audit log, system health, error triage, recruiting center, application analysis, all rosters, all DSARs | announcements (any), banners, project openings, clients, projects, blasts, ingest CSVs, role grants | any record (RLS admin branch), class approval/denial, role promotions | any record (RLS admin branch + cascading user delete), DSAR fulfillment | yes |
| service_role (Lovable agent + edge fns) | full bypass for migrations, cron jobs, edge fns, audit log writes | same | same | same | yes |

Every fix below is checked against this matrix in the verification step.

## Findings → fixes (only the open ones)

### H-01 · Sanitize event description HTML (frontend-only)
- Files: `src/components/events/EventDetailDialog.tsx:98`, `src/components/events/CommunityEventCard.tsx:99`.
- Wrap the existing `descriptionHtml` strings with `sanitizeHtml()` from `@/lib/security` before passing to `dangerouslySetInnerHTML`.
- Memoize with `useMemo` on `event.description` to avoid re-sanitizing per render.
- No DB, no edge fn, no schema. Zero permission impact.

### H-02 · Production response headers (static config only)
- `public/_headers` already declares the full CSP, `X-Frame-Options: DENY`, `Permissions-Policy`, COOP, HSTS-with-preload. The probe failed because the live host (`*.lovable.app`) doesn't honor Netlify-style `_headers`.
- Action: add the same header set as `<meta http-equiv>` tags inside `index.html` for the directives that are honored as meta (CSP, Referrer-Policy, Permissions-Policy via `<meta>` is partially honored; X-Frame-Options is **not** meta-honored — document this gap as accepted).
- Add `frame-ancestors 'none'` via CSP meta tag (this IS the modern replacement for X-Frame-Options and IS honored as meta on most browsers).
- Keep `public/_headers` for the custom-domain Cloudflare path that does honor it.
- No code paths that fetch from current allow-listed origins are affected (Supabase, Discord webhooks server-side only, Lovable AI Gateway, Google OAuth, Clarity, GA4, CookieYes — all already in CSP).

### M-01 · Zod coverage on edge functions
- Scope: add Zod parsing to handler entry points that currently `await req.json()` without validation. Excludes:
  - functions that already validate (do not double-wrap),
  - functions that take **no body** (GET-style),
  - cron-triggered functions called only by service-role.
- Pattern: at the top of each handler, parse with a `z.object({...}).safeParse(...)`; on failure return `400` with the existing `corsHeaders`. Do NOT change auth gates, do NOT change DB writes, do NOT change response shapes on success.
- Schemas mirror the existing field expectations (read each fn's current usage of `body.x` first; schema is a documentation of the status quo, not a tightening).
- Rollout: 10–15 functions per PR, each PR independently revertible. Any function whose existing client call passes an extra/legacy field gets that field added as `.optional()` to avoid breakage.
- Verification per fn: `supabase--curl_edge_functions` with the exact body the client sends today; assert 200.

### M-02 · HSTS preload
- Already present in `public/_headers` (`max-age=63072000; includeSubDomains; preload`).
- Action: add the same as a `<meta>` is **not possible** for HSTS (HSTS only works as response header). Document in `docs/runbooks/` that custom-domain hosting (Cloudflare) serves the header; `*.lovable.app` is out of our control. Submit `techfleet.network` to `hstspreload.org` once we re-verify the header is live on the apex.
- No code change. Documentation + external submission only.

### M-03 · COOP/COEP
- `Cross-Origin-Opener-Policy: same-origin` is already in `public/_headers`. COEP would break Google OAuth popup + YouTube/Luma iframes (we use them) so we will **NOT** enable COEP.
- Action: explicit accepted-risk note in the security memory and in `docs/threat-model.md` explaining COEP is intentionally off; mitigation is `frame-ancestors 'none'` + per-origin allow-list in CSP.

### M-05 · Per-edge-fn CORS audit
- Read-only inventory pass: grep every `supabase/functions/*/index.ts` for `Access-Control-Allow-Origin` overrides.
- Where a function currently sets `*`, replace with `corsHeaders` from `npm:@supabase/supabase-js@2/cors` (which echoes the request origin against the Supabase-managed allow-list). No behavior change for first-party callers.
- Functions that intentionally must accept `*` (public webhooks signed by sender — Discord, Resend bounces) keep `*` and get a code comment + memory note.
- Verification: `supabase--curl_edge_functions` from preview origin returns same status as before for every changed fn.

### L-01 · `npm audit`
- Action: run `npm audit --json` in CI (`.github/workflows/secret-scan.yml` already exists; add an `audit` step). No dependency upgrades in this pass — upgrades go through the standard PR review.

### L-03 · Realtime channel scope
- The finding is "ELSE true on non-admin topics — scope per channel." We will **NOT** modify the `realtime.messages` policy (touching it risks breaking every live subscription including admin telemetry, notifications, announcements, system health, cohort chat).
- Action: document each realtime topic's intended audience in `docs/attack-surface.md`, and add a frontend assertion that subscriptions only request topics the current role is allowed to see. Backend stays permissive (current behavior preserved).

### L-04 · `fleety_turn_signals` (already accepted-risk)
- No change. Memory note already exists.

### M-04 · Cloudflare `cf_bm` (already accepted-risk)
- No change. Third-party cookie out of our control.

## Execution order

1. **Read-only verification first.** Snapshot `pg_policies`, `pg_proc.proname`, role grants, storage policies → save to `/mnt/documents/security-audit-evidence/pre-fix-baseline/`. This is the rollback reference.
2. H-01 sanitization (1 PR, ~15 LOC).
3. H-02 + M-02 + M-03 header/meta + docs (1 PR, no code logic changes).
4. M-05 CORS inventory + non-behavioral cleanup (1 PR).
5. M-01 Zod rollout (multiple small PRs, batched 10 fns each).
6. L-01 CI step (1 PR).
7. L-03 docs + frontend assertion (1 PR).
8. **Post-fix verification.** Re-snapshot `pg_policies`/`pg_proc`/grants → diff vs. baseline → expected diff = **empty**. Run smoke matrix below.

## Smoke matrix (run after every PR)

| Actor | Action | Expected |
|---|---|---|
| anon | submit DSAR | 200 |
| anon | view `/project-openings/:slug` | 200 |
| member | update own profile | 200, row updated |
| member | submit project application | 200 |
| member | delete own notification | 200 |
| teacher | create class | 200 |
| teacher | edit own class | 200 |
| admin | publish announcement | 200 |
| admin | promote user to teacher | 200 |
| admin | delete a test user (cascade) | 200 |
| service_role (edge fn) | write `audit_log` | 200, hash chain valid |
| Lovable agent (`supabase--read_query`) | `select count(*) from profiles` | row count > 0 |
| Lovable agent (`supabase--migration` dry run) | `select 1` | 1 |

Any red row = immediate revert of the most recent PR before continuing.

## Out of scope for this pass (explicitly deferred, separate approval required)

- Any new RLS policy or policy revision.
- Any change to `SECURITY DEFINER` functions.
- Any role-grant change in Postgres.
- Any dependency major-version bump.
- Enabling COEP.
- Tightening realtime.messages policies.

## Deliverables

- Code PRs as listed above.
- Updated `.lovable/memory/tech/security/audit-2026-05-13.md` recording what shipped and what was deferred.
- `/mnt/documents/security-audit-evidence/post-fix-diff.md` proving zero diff in policies/grants/definers.
- Updated `security-audit-findings.json` with each finding flipped to `fixed`, `accepted-risk`, or `deferred`.
