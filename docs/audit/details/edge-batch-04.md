# Edge function security audit — Batch 04

Reviewer: skeptical appsec engineer. READ-ONLY. Code root: `C:/Users/morga/Documents/tfn-audit/supabase/functions`.
Scope: 19 functions (session-revocation + consent/auth recorders + misc cron workers).
Standard: `decisions.md` §4/§5/§8, `supabase/functions/CLAUDE.md`. Flags cross-checked against
`scratchpad/audit/edge-fn-coverage-matrix.md` by reading each `index.ts` fully.

All 19 reviewed: record-auth-wedge, record-consent, record-policy-acknowledgment, record-web-vital,
refresh-community-events, refresh-email-health, register-fleety-command, register-support-command,
repair-discord-username, replay-dlq-emails, replay-email-dlq, resend-signup-confirmations,
resend-webhook, resume-application-reminder, revoke-recording-consent, revoke-teacher-role,
revoke-user-sessions, save-form-draft, scrape-figma-workshops.

---

## (a) Per-function table

| fn | classification | authN ok? | authZ / IDOR | input valid | secrets | err-leak (matrix→verdict) | err-handling §4 |
|---|---|---|---|---|---|---|---|
| record-auth-wedge | public telemetry beacon (by design) | n/a (public) | no identity; per-IP in-mem RL | ✅ enum allow-lists | svc-role from env | ✅→**CONFIRM** L112,L154 | ok (returns on insert err) |
| record-consent | svc-role consent writer, auth optional | optional JWT verified | user_id from JWT only; anon_id client-set (by design) | ✅ typed+clamped | svc-role from env | ✅→**CONFIRM** L111 | dedupe err swallowed (best-effort, ok) |
| record-policy-acknowledgment | policy-ack recorder, auth optional | optional JWT via RLS client | RPC runs in JWT ctx; anon_id by design | ✅ VALID_KEYS/METHODS/len | anon-key client | ✅→**CONFIRM** L62 | ok |
| record-web-vital | public RUM beacon | n/a (public) | client user_id spoofable (low-sev) | ✅ strong clamps/allow-lists | svc-role from env | ✅→**REFUTE** (204 null body; msg only in console.error L226) | insert err dropped (documented best-effort) |
| refresh-community-events | cron ICS→cache worker | ✅ dedicated secret OR svc-role, constant-time | trigger-cred only | ICS parser bounded | svc-role + EVENTS_REFRESH_SECRET | ✅→**REFUTE** (static "Refresh failed" L633; msg only logged/DB col) | ✅ reports to DB + logs |
| refresh-email-health | cron MV refresh + auto-pause | ✅ svc-role exact-match (inline) | svc-role only | n/a | svc-role from env | ✅→**CONFIRM** L52 ratesErr.message | best-effort inserts unchecked (cron, low) |
| register-fleety-command | admin registers Discord cmd | ✅ JWT | admin via **direct user_roles** (hand-rolled) | n/a | bot token, svc-role | ·→ok (returns Discord `data` not caught err) | ok |
| register-support-command | admin registers Discord cmd | ✅ JWT | admin via **direct user_roles** (hand-rolled) | n/a | bot token, svc-role | ·→ok | ok |
| repair-discord-username | user self-repair of own discord_username | ✅ JWT (getClaims) | own-resource (user_id=sub); updates only own row | isUsable guards | bot token, svc-role | ·→**CONFIRM none** (static reasons) | ✅ reports; audit swallow benign |
| replay-dlq-emails | admin re-enqueue DLQ emails | ✅ JWT | admin via **direct user_roles count** (hand-rolled) | ✅ zod | svc-role | ·→ok (static "Internal error") | ✅ good; dup renderer (see F-7) |
| replay-email-dlq | cron DLQ re-enqueue | ✅ svc-role (shared helper, constant-time) | svc-role only | n/a | svc-role | ·→ok | ✅ per-msg try/catch + escalate |
| resend-signup-confirmations | cron signup-reminder | ✅ svc-role exact-match (inline) | svc-role only | n/a | svc-role | ✅→**CONFIRM (minor)** errors[].error = linkErr.message L128 (cron/admin-only) | ✅ strong |
| resend-webhook | Resend delivery webhook | ✅ **Svix signature verify** before any write | signature-gated | ✅ size cap + classify | RESEND_WEBHOOK_SECRET, svc-role | ·→ok (static msgs, PII redacted) | ✅ exemplary threat model |
| resume-application-reminder | cron draft reminder | ✅ svc-role exact-match (inline) | svc-role only | n/a | svc-role | ✅→**CONFIRM (minor)** L52 error.message (cron-only) | ✅ wasDelivered one-shot gate |
| revoke-recording-consent | user revokes own consent | ✅ JWT via RLS client | own-resource only (user_id=self) | slice caps | anon-key client | ·→ok (static) | ❌ **insert/update errs dropped → ok:true on failure (F-1)** |
| revoke-teacher-role | admin revokes teacher role | ✅ JWT | admin via **has_role RPC inline** (not shared wrapper) + self-revoke guard | ✅ zod+String() | svc-role | ·→**REFUTE (leak present)** L95-96 err.message in body | has_role err dropped (fails closed) |
| revoke-user-sessions | admin force-signout | ✅ JWT + **fresh 2FA step-up** | admin via **direct user_roles** + requireFreshAdmin2fa | ✅ zod | svc-role, anon | ·→ok (static "Internal error") | revoked_sessions insert err unchecked (F-5) |
| save-form-draft | user draft beacon | ✅ JWT header **or `?token=` query** | own-resource (user_id=self, RLS) | ✅ 256KB cap + typed | anon-key client | ✅→**CONFIRM** L144,L155 | reports via resp |
| scrape-figma-workshops | admin/cron Figma scraper | ✅ JWT OR token==SERVICE_KEY | admin via **direct user_roles** (hand-rolled); SSRF-gated | ✅ FIGMA_HOST_RE | svc-role, FIRECRAWL_KEY | ✅→**CONFIRM** L372 + L194/227/277 detail (admin-only) | ✅ |

---

## (b) Findings

### HIGH

**F-1 · revoke-recording-consent · consent-revocation writes drop their errors → false success**
`supabase/functions/revoke-recording-consent/index.ts:43-59,65`. The update (L44-47) and insert
(L48-58) results are never destructured/checked; the handler returns `json({ ok: true })`
unconditionally (L65). A failed write (RLS denial, transient DB error, constraint) is invisible to
both the user and operators — the user is told their legal consent revocation succeeded when nothing
persisted. §4 (every failure must recover/retry/**report**) + compliance (GDPR/T&C §11 revocation is
the function's sole job). Evidence: code read, not executed. Smallest fix: capture `{ error }` on
both writes; on error return 500 and let the audit wrapper record it (don't return ok:true).

### MEDIUM

**F-2 · Error-message/stack leaked in response body (§8 — CodeQL js/stack-trace-exposure).** Each
returns a caught DB/RPC/`Error.message` to the client. Fix: log the real error, return a static
message (the `errorResponse` owner pattern in decisions §8).
- `record-consent/index.ts:111` — `json({ error: error.message }, 500)` (**public/user-facing** — priority).
- `record-policy-acknowledgment/index.ts:62` — RPC error.message (**user-facing**).
- `record-auth-wedge/index.ts:112,154` — insert/RPC error.message (**public**).
- `save-form-draft/index.ts:144,155` — `upsertErr.message` / `(err as Error).message` (**user-facing**).
- `refresh-email-health/index.ts:52` — `ratesErr.message` (svc-role caller, lower).
- `revoke-teacher-role/index.ts:95-96` — `err.message` in body. **Matrix marked err-leak `·` (no); REFUTE — it IS a leak.**
- `scrape-figma-workshops/index.ts:372` + Firecrawl detail echoed in `discovery`/`results` (L194,227,277) — admin-only, lower.
- `resend-signup-confirmations/index.ts:128` (errors[].error) and `resume-application-reminder/index.ts:52` — cron/admin-only, lowest.

**F-3 · save-form-draft · access token accepted via `?token=` query param.**
`save-form-draft/index.ts:76-77`. JWT falls back to the URL query string for `navigator.sendBeacon`
(which cannot set headers). Tokens in URLs are written to edge/CDN/proxy access logs and can leak via
Referer (OWASP A01/A09). Mitigations: it is a short-lived access token (no refresh token) scoped to
the caller's own drafts under RLS. Evidence: code read. Smallest fix: prefer `fetch({keepalive:true})`
with the Authorization header for the authenticated path; if `?token=` must stay, document log
redaction for this route and keep token TTL minimal.

**F-4 · Hand-rolled admin check instead of the shared predicate (decisions §5 / functions CLAUDE.md
"No inline admin checks").** Not an authZ bypass — all gate to admin correctly — but each re-derives
the admin predicate, so a future change to the role model drifts silently across copies.
- Direct `user_roles` select/count: `register-fleety-command:48-53`, `register-support-command:48-53`,
  `replay-dlq-emails:263-267`, `revoke-user-sessions:42`, `scrape-figma-workshops:99-104`.
- `revoke-teacher-role:49` calls `has_role` inline (canonical predicate, but not via `requireAdminRequest`).
- **All CONFIRM the matrix hand-rolled-role flag.** Fix: route through `requireAdminRequest`
  (`_shared/request-auth.ts`), which also emits `authz_admin_denied` audit rows.

**F-5 · Inline CORS omits `x-trace-id`/`x-request-id` on browser-invoked functions (decisions §5,
ADR-0043).** A hand-rolled allow-list that drops `x-trace-id` fails the invokeEdge preflight
(`FunctionsFetchError`, zero edge logs) the moment the caller migrates.
- `revoke-user-sessions/index.ts:13-16` and `save-form-draft/index.ts:17-21` — both omit `x-trace-id`;
  both are plausibly invoked from the admin/app UI. **CONFIRM matrix cors-inline-not-shared.** Fix:
  import `corsHeaders` from `_shared/http.ts`.
- `record-web-vital/index.ts:39-49` also inline, but it is a `sendBeacon` (CORS-safelisted, no custom
  headers, no preflight) with an explicit origin allow-list — acceptable; informational only.

**F-6 · revoke-user-sessions · `revoked_sessions` insert error unchecked.**
`revoke-user-sessions/index.ts:63-67`. The audit/record insert result is discarded; the global
signOut (L69) proceeds regardless. If the insert fails the revocation record is lost though the
session is killed. §4. Fix: capture the error and report (still allow the signOut).

**F-7 · replay-dlq-emails · duplicated announcement HTML renderer + hand-rolled tag-regex linkify in
an edge function (decisions §2 ownership / §8 "edge fns must not hand-roll HTML stripping").**
`replay-dlq-emails/index.ts:64-221` reimplements `renderAnnouncementEmail`/`linkifyHtml` "kept in
sync with send-announcement-email" by hand, using `<a`, `<p>` etc. tag regexes. Two copies of the
renderer drift; the regex HTML handling belongs to the `_shared/html-to-text.ts` / email-render
owner. Fix: extract the renderer into a shared module both functions import.

### LOW / informational

**F-8 · record-web-vital · client-supplied `user_id` attributed to any UUID.** `index.ts:181-186`
validates UUID shape but not ownership; service-role insert. Low sensitivity (RUM metric, no PII).
Otherwise the best-hardened function in the batch (bounded body, rate limit, strict allow-lists).

**F-9 · record-consent / record-policy-acknowledgment · `anon_id` is client-controlled.**
A caller may write consent/ack rows for an arbitrary `anon_id`. By design for pre-auth/anonymous flows
and low-sensitivity. **Key compliance check passes:** for an authenticated user the `user_id` is taken
only from the verified JWT (`record-consent:63`) or the RLS/JWT RPC context
(`record-policy-acknowledgment:48-61`) — an attacker **cannot forge a consent/acceptance record
attributed to an identified user**. No cross-user forgery.

**F-10 · scrape-figma-workshops · SSRF is constrained, `profile` weakly validated.**
`index.ts`. User `urls` are gated by `FIGMA_HOST_RE` (`^https://www\.figma\.com/community/file/\d+/…$`,
L142); discovery URLs are built from a `profile` handle interpolated only into
`https://www.figma.com/@<handle>` (host fixed, `@` stripped, L133-136); and Firecrawl — not the edge
fn — performs the fetch. Worst case: scrape an arbitrary `figma.com` path. Admin-gated. Also
`token !== SERVICE_KEY` (L86) is a non-constant-time compare (minor timing side-channel vs the shared
`timingSafeEqualStr`). **No exploitable SSRF.**

**F-11 · Good patterns to preserve (not findings).** `resend-webhook` (Svix signature verify before
any DB write, PII redaction, idempotent suppression, documented lockout-recovery — exemplary);
`replay-email-dlq` + `refresh-community-events` (shared constant-time service-role/secret auth);
`revoke-user-sessions` (fresh-2FA step-up on a destructive admin op); `repair-discord-username`
(own-resource only, writes only `discord_username`, bounded discordFetch budget).

---

## Cross-check summary vs matrix (my batch)
- **err-leak:** CONFIRM record-consent, record-policy-acknowledgment, record-auth-wedge,
  refresh-email-health, save-form-draft, scrape-figma-workshops, resend-signup-confirmations,
  resume-application-reminder. **REFUTE** record-web-vital (204 null body) and refresh-community-events
  (static "Refresh failed") — heuristic false positives (message only in console.error / DB column).
  **Matrix MISS:** revoke-teacher-role leaks `err.message` (L95-96) but was marked `·`.
- **hand-rolled-role:** CONFIRM all 6 (register-fleety-command, register-support-command,
  replay-dlq-emails, revoke-teacher-role, revoke-user-sessions, scrape-figma-workshops).
- **audit-wrapped:** CONFIRM 19/19.

## Limitation
Static read-only review; no deploy/runtime. RLS policies on `recording_consents`, `cookie_consents`,
`form_drafts`, `user_roles`, and the bodies of RPCs (`record_policy_ack`, `has_role`,
`enqueue_email_v2`, `pgmq_*`) were NOT inspected — IDOR/forgery verdicts assume those RPCs enforce the
JWT/`auth.uid()` context they appear to rely on. `config.toml` `verify_jwt` values were not
re-confirmed against the per-file header comments.
