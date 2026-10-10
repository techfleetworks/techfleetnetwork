# Edge batch 05 — security review (Fleety chat, email-send cluster, captcha, sanctions)

Reviewer: skeptical app-sec. READ ONLY. Root: `C:/Users/morga/Documents/tfn-audit`.
Each `index.ts` read in full; config.toml `verify_jwt` cross-checked; shared `_shared/request-auth.ts`,
`http.ts` read; matrix flags (err-leak, hand-rolled-role) CONFIRMED/REFUTED against code.

## (a) Per-function table

| fn | verify_jwt | classification / intended? | authN | authZ/IDOR | input/injection | secrets | err-leak (matrix→verdict) | err-handling §4 |
|---|---|---|---|---|---|---|---|---|
| screen-sanctions | false (pre-account, intended) | public compliance write | none (by design) | n/a | country regex + email slice; anon key | env ok | ✅→REFUTE (static `screening_unavailable`) | fails closed 503 ✓ |
| seed-content | false | one-shot bootstrap, service-role | `auth.includes(serviceKey)` (weak compare, ok) | service-role only | fixed file list, no user input | env ok | ✅→CONFIRM minor (L124 `String(e.message)` in results; service-role only) | per-item try/catch ✓ |
| send-announcement-email | false | admin broadcast | JWT getUser + **hand-rolled** admin (user_roles select) | admin only; audience server-derived (RPC) | zod + attestation gate; test_recipients admin-only | env ok | ·→REFUTE (static) | try/catch, static 500 ✓ |
| send-application-confirmation | false (dual-mode, intended) | confirmation drain | Mode A service-role; Mode B getUser | **IDOR-safe**: row.user_id===uid | recipient server-derived (outbox/profile) | env ok | ✅→CONFIRM (L172,L248 `error.message`) | try/catch ✓ |
| send-community-agreement-trigger | false | admin/internal trigger | x-internal-secret OR getUser+has_role (inline) | admin/internal; recipient server-derived | UUID regex; escapeHtml | internalSecret falls back to serviceKey | ✅→REFUTE (all `err()` static) | notif/email non-crit, audited ✓ |
| send-magic-link | false (pre-auth, intended) | magic-link fallback | none (anti-enum) | n/a; recipient = existing account only (shouldCreateUser:false) | zod email+domain allowlist; per-IP RL | env ok | ✅→REFUTE (generic 200) | fail-generic ✓ |
| send-project-blast | false | admin blast | JWT getClaims + **hand-rolled** admin (user_roles count) | admin only; recipients server-derived (applicants) | strict key allowlist, size cap, DB-sanitized HTML, RL 5/hr | env ok | ·→CONFIRM minor (L232 `detail: insErr?.message`) | try/catch, audited ✓ |
| send-push-notification | false | push, service-role | `authHeader===Bearer serviceKey` (strict) | service-role (DB trigger) | zod + https-only SSRF check on endpoint | env ok | ✅→REFUTE (static `Push delivery failed`) | try/catch, 410 handling ✓ |
| send-transactional-email | true | internal email | `authHeader===Bearer serviceKey` | service-role only | zod passthrough; recipient internal | env ok | ·→REFUTE (`result.error` controlled) | branch on result ✓ |
| sign-out-all-devices | false (manual JWT, intended) | self-serve revoke | requireAuthenticatedRequest | **IDOR-safe**: writes own uid | reason allowlist | shared admin-client | ✅→REFUTE (errorResponse static) | errorResponse ✓ |
| spf-sync | true | background ingest | service-role OR getUser+has_role (inline) | admin/service-role | SSRF-guarded fetch, redirect:error, contract-validate, fail-closed | env ok | ✅→CONFIRM minor (results carry error.message; admin-only) | per-dataset try/catch, circuit breaker ✓ |
| submit-dispute | true (platform) | compliance intake | JWT (platform) + optional | email regex; summary bounds; per-IP RL | anon key + RPC | env ok | ✅→REFUTE (static `internal_error`) | RPC error→500 static ✓ |
| support-monthly-report | false | cron MV refresh | authorizeServiceRoleRequest | service-role | no user input | shared admin-client | ✅→REFUTE (static) | await+inspect, static 500 ✓ |
| support-provisioning-retry | false | cron retry | authorizeServiceRoleRequest | service-role | no user input | shared admin-client | ·→REFUTE (FreescoutError.message controlled) | per-row try/catch, attempts cap ✓ |
| techfleet-chat | false (code-enforced, intended) | **Fleety AI chat** | isTrustedInternal OR getUser | member-scoped; no privilege op | WAF, prompt-injection patterns, system-role strip, canary, output sanitize+DLP, size/count/role caps | env ok | ✅→REFUTE (no error.msg in responses; AI out scrubbed) | degrade (ADR-0044), audited ✓ |
| translate-bundle | false | AI translate | guardTranslationRequest (JWT+spend cap) | any signed-in | locale regex; **namespace unvalidated in URL path** | service-role | ·→REFUTE (static `Translation failed`) | try/catch ✓ |
| translate-strings | false | AI translate | guardTranslationRequest (JWT+spend cap) | any signed-in | locale regex, 200×2000 caps, content-addressed | service-role | ·→REFUTE | best-effort fill ✓ |
| triage-error | true | admin AI triage | getUser + has_role (inline) | admin only | zod; row from DB; pre-AI silencer; daily cap | env ok | ·→CONFIRM minor (L237 `detail`, L257 `raw` = AI body, admin-only) | 502/429/402 mapped ✓ |
| validate-email-domain | false (pre-auth, intended) | domain MX check | none (by design) | n/a | domain regex, 2KB cap | — | ·→REFUTE (fail-open static) | fail-open 200 ✓ |
| verify-turnstile | false (pre-auth, intended) | captcha verify | none (token IS the auth) | n/a | zod token+action enum | TURNSTILE_SECRET_KEY | ·→REFUTE (errorResponse) | **see F1** |
| write-exploration-cache | false | cache write | `token===serviceRoleKey` (strict; JWT fallback removed) | service-role only | zod + length caps | shared admin-client | ·→REFUTE (errorResponse) | try/catch ✓ |

## (b) Findings

**F1 — MEDIUM — verify-turnstile — index.ts:39-41,78-81 — Origin-header-trusted test-secret fallback = Turnstile bypass.**
`isProd = isProductionOrigin(originHostFromRequest(req))` is derived from the attacker-controlled Origin/Referer
header. When `!isProd`, line 78 falls back to Cloudflare's always-pass TEST_SECRET. A caller hitting the
production function with a spoofed non-prod Origin (e.g. `localhost`, a `*.lovableproject.com` value) and a
Cloudflare test token gets `{success:true}` without solving a challenge. Evidence state: CONFIRMED by code
reading (control flow is unambiguous). Caveat lowering impact: the endpoint returns no capability token that
downstream auth binds to, so a scripted attacker can equally just skip it — real captcha enforcement must live
at login-with-captcha (other batch). Smallest fix: gate the TEST_SECRET path on a server-side env flag
(`Deno.env.get("ENVIRONMENT") !== "production"`), never on the request Origin.

**F2 — MEDIUM — send-application-confirmation — index.ts:172, 248 — raw DB `error.message` returned to caller.**
`{ error: error.message }` / `{ error: rowErr.message }` leak internal/Postgres error text. Reachable only by a
service-role caller (Mode A, L172) or an authenticated member (Mode B, L248), so not anon-exposed. Evidence:
CONFIRMED (quoted lines). Fix: return a static string; log the detail via the logger.

**F3 — LOW — send-project-blast — index.ts:232 — `detail: insErr?.message` in 500 response (admin-only).**
Not flagged in matrix (err-leak `·`) — CONFIRMED by reading. Admin-gated. Fix: drop `detail`.

**F4 — LOW — seed-content:124 / spf-sync:215,223 / triage-error:237,257 — error/AI detail echoed in result objects.**
All service-role- or admin-gated. CONFIRMED. Low blast radius; tighten to static text.

**F5 — LOW (consistency/drift) — hand-rolled admin checks instead of `requireAdminRequest`.**
send-announcement-email (user_roles select), send-project-blast (user_roles count), send-community-agreement-trigger
/ spf-sync / triage-error (inline `has_role` RPC). All perform a REAL admin check — no missing-gate bug — but
bypass the shared predicate (decisions §5, functions/CLAUDE.md "No inline admin checks"). CONFIRMED. Risk is
drift, not a present hole. techfleet-chat's user_roles read (L860) is audience/tone only, NOT an authz gate — benign.

**F6 — LOW — send-community-agreement-trigger:58 — `INTERNAL_FN_SECRET || serviceKey` fallback.**
If INTERNAL_FN_SECRET is unset, the service-role key doubles as the internal secret. Still a secret, but couples
two credentials. Fix: require INTERNAL_FN_SECRET explicitly or fail closed.

**F7 — LOW — translate-bundle:71 — `namespace` unvalidated, interpolated into fetch URL path.**
`new URL('/locales/en/'+namespace+'.json', SUPABASE_URL)`. Base host is fixed so cross-host SSRF is not possible;
worst case is same-origin path traversal + odd cache rows (JWT+spend-cap gated). Fix: validate namespace against `^[a-z0-9_-]+$`.

**F8 — INFORMATIONAL — techfleet-chat:632 — Content-Length header trusted for the 256KB cap.**
`req.json()` is not the bounded reader; the header can be omitted. Per-field zod caps (msg 20k, ≤50 msgs,
attachment 60k) bound the effective size, so no real DoS. Consider the shared bounded-body reader.

## Cross-cutting verdicts

- **send-\* open-relay / recipient control:** NO open relay in any of the 7 senders. Every one either (a) derives
  the recipient server-side from the authenticated user / a DB outbox / project-applicant query
  (send-application-confirmation, send-community-agreement-trigger, send-project-blast, send-announcement-email),
  or (b) is service-role-only internal (send-transactional-email, send-push-notification), or (c) only triggers
  Supabase's own magic-link to an already-existing account (send-magic-link, `shouldCreateUser:false`,
  anti-enum). The one place recipients come from the body (send-announcement-email `test_recipients`) is
  admin-gated and capped at 50. No arbitrary-recipient / arbitrary-content path for an unauthenticated caller.

- **techfleet-chat prompt-injection verdict:** STRONG. No real-world tool is exposed to the model — the only
  `tools:[...]` is a forced structured-output `route` classifier (intent/off_topic/needs_web) with zero I/O
  capability (`tool_choice` forced, result just JSON-parsed; web path is dead code, D-04). Material reading is a
  server-side SSRF-guarded pre-fetch (`fetchMaterialText`, allow-list, no-redirect, 40KB cap), framed as UNTRUSTED
  DATA — matches ADR-0010/§9. Defenses: injection-pattern detect, system-role message stripping, canary + output
  sanitizer (strip system markers, PII redaction, `dlpScrub`, active-content strip on both streamed & buffered
  paths), content-safety gate, capability-denial block (ADR-0034), global + per-user rate limit, graceful degrade.
  No injection or tool-escalation hole found.

- **err-leak CONFIRMED vs REFUTED (matrix):** Of the 9 batch fns the matrix flagged ✅: CONFIRMED 3
  (send-application-confirmation, seed-content, spf-sync) — all low/med, none anon-exposed; REFUTED 6
  (send-community-agreement-trigger, send-magic-link, send-push-notification, submit-dispute,
  support-monthly-report, techfleet-chat — error.message appears only in logs/audit, responses are static).
  Additionally found 2 leaks the matrix MISSED (`·`): send-project-blast:232, triage-error:237/257 (both admin-only).

- **Biggest limitation:** Static read only — no running instance, so F1 (Origin-spoof captcha bypass) and the
  recipient-derivation claims were not dynamically exercised; `_shared` helpers (material-fetch SSRF allow-list,
  guardTranslationRequest, authorizeServiceRoleRequest, has_role RPC) were trusted from their call contracts /
  comments, not independently audited in this batch. OneDrive FS made bash globbing unreliable; used Read/Grep.

CRITICAL: 0 · HIGH: 0 · MEDIUM: 2 (F1, F2) · LOW: 5 (F3–F7) · INFO: 1 (F8)
