# Edge function security audit — Batch 03

Reviewer: skeptical appsec engineer. READ-ONLY. Code root: `C:/Users/morga/Documents/tfn-audit`.
Reviewed all 20 assigned functions in full + shared helpers (`admin-step-up.ts`, `service-role-auth.ts`),
`decisions.md` §4/§5/§8, `supabase/functions/CLAUDE.md`, and `config.toml` verify_jwt. Matrix flags
cross-checked against code (CONFIRM/REFUTE below).

## (a) Per-function table

| function | class / intended | authN for sensitivity | authZ / IDOR | input valid. | secrets | err-leak (matrix→verdict) | err-handling §4 |
|---|---|---|---|---|---|---|---|
| notify-applicant-status | admin action (status+email+discord) | ✅ getUser + **has_role RPC** (verify_jwt=true too) | admin-only; UUIDs validated; no IDOR | ✅ UUID/url/size 32KB/escapeHtml | ✅ env | matrix ✅ → **REFUTE** (static msgs) | ✅ reports |
| notify-class-published | admin notify followers | ✅ getUser + **hand-rolled** user_roles | admin-only; class_id UUID | ✅ zod+regex, escapeHtml | ✅ | · → none | ✅ |
| notify-critical-fix | cron push to admins | ✅ service-role (shared, const-time) | n/a (service only) | n/a (no user input) | ✅ | · → none | ✅ |
| preview-transactional-email | internal preview (Go API) | ✅ LOVABLE_API_KEY exact | n/a | n/a | ✅ | ✅ → **CONFIRM** L :93 | ✅ |
| prewarm-ugc-worker | cron AI translation drain | ✅ service-role (direct compare) | n/a | n/a | ✅ | ✅ → **CONFIRM** L :137 | ✅ |
| process-email-queue | cron email sender | ✅ service-role (shared) | n/a | n/a | ✅ | ✅ → **REFUTE** (logged/DLQ, not returned) | ✅ |
| process-freescout-events | cron queue drain | ✅ service-role (shared) | n/a | htmlToPlainText+escapeHtml | ✅ | ✅ → **REFUTE** (console only) | ✅ |
| process-notification-fanout | cron/admin fanout | ✅ service-role OR **hand-rolled** admin JWT | admin/service | n/a | ✅ | ✅ → **CONFIRM** L :98 | ✅ |
| promote-to-admin | **privilege escalation** | ✅ getUser + **hand-rolled** admin + **requireFreshAdmin2fa** | admin-only, self-promo blocked, 2-step email confirm | ✅ zod, escapeHtml (no UUID fmt check) | ✅ | · → none (static) | ✅ |
| promote-to-teacher | **privilege escalation** | ✅ getUser + **hand-rolled** admin; **NO 2FA step-up** | admin-only, self-promo blocked, UUID regex, 2-step confirm | ✅ zod+UUID | ✅ | · → none | ✅ |
| public-classes | anon marketing feed | anon key (RLS-enforced) ✅ | public by design | track allowlist | ✅ | · → none | ✅ |
| public-project-detail | anon project page | WAF; **service-role (RLS bypass)** curated cols + DLP scrub | public; projectId UUID | ✅ regex + scrubJson | ✅ | · → none | ✅ |
| public-project-openings | anon openings feed | WAF; **service-role** curated cols + DLP scrub | public; status allowlist | ✅ scrubJson | ✅ | · → none | ✅ |
| push-config | public VAPID pubkey | none needed (public key) | public by design | n/a | ✅ (pubkey only) | · → none | wrapper only (no inner try) |
| quest-nudge | cron nudge | ✅ service-role (direct compare) | n/a | escapeHtml | ✅ | ✅ → **CONFIRM** L :56 | ✅ |
| rate-limit | **public pre-auth** limiter | none (by design) | public; identifier/action allowlist, peppered hash | ✅ zod+len+allowlist | ✅ (key as pepper) | ✅ → **REFUTE** (returns rpc result) | ✅ fail-open (deliberate) |
| reap-class-module-orphans | cron storage reaper | ✅ service-role (shared) | n/a; isReapableKey path guard; DRY-RUN default | key-shape guard | ✅ | ✅ → **CONFIRM** L :49,:60 | ✅ |
| reconcile-stuck-emails | cron reconciler | ✅ service-role (shared) | n/a | n/a | ✅ | ✅ → **CONFIRM** L :40 | ✅ |
| record-auth-event | public telemetry beacon | none (verify_jwt=false by design) | public; kind allowlist + 1KB cap + actor UUID | ✅ | ✅ | · → none (static) | ✅ |
| record-auth-recovery | public reset beacon | none (by design) | public; enum allowlists, 4KB cap, IP-hash, per-IP RL | ✅ | ✅ | ✅ → **REFUTE** (console.warn, 204) | ✅ |

## (b) Findings

### CRITICAL — none
The privilege-escalation path is sound. No non-admin path to either promote-* function; self-promotion
is blocked; both are two-step (email confirmation to the target), so even an admin cannot flip a role
without the target clicking a signed-in confirm POST.

### HIGH — none

### MEDIUM

**M1 — promote-to-teacher has NO fresh-2FA step-up (promote-to-admin does).** `promote-to-teacher/index.ts`
checks admin role only; it never calls `requireFreshAdmin2fa`, which `promote-to-admin/index.ts:94` uses
(aal2 + fresh `two_factor_login_sessions` within 10 min). Teacher is a privileged, content-authoring role.
Evidence: CONFIRMED by reading both files. Impact: a hijacked/stale admin session (no fresh 2FA) can mint a
teacher but not an admin — inconsistent step-up posture. Smallest fix: add the same
`requireFreshAdmin2fa(adminClient, authHeader, callingUser.id, 10)` gate after the admin-role check.

**M2 — public-project-detail exposes `clients.primary_contact` (and staff names) to anonymous callers.**
`public-project-detail/index.ts:61` selects `primary_contact` from `clients`; `:114` returns coordinator
`display_name/first_name/last_name`. `scrubJson` strips email-shaped values but NOT a plain contact name.
Evidence: CONFIRMED in code; what `primary_contact` actually stores (name vs email vs phone) is the
LIMITATION — if it is a person's name/phone, that is anon PII exposure. Smallest fix: drop `primary_contact`
from the public SELECT unless product requires it.

**M3 — hand-rolled admin role checks instead of the `has_role` owner (CLAUDE.md "No inline admin checks").**
CONFIRMED in: `promote-to-admin:80-85`, `promote-to-teacher:69-74`, `notify-class-published:60-65`,
`process-notification-fanout:40-47` (all `from("user_roles").eq("role","admin")`). Queries are correct, so
this is drift risk (a change to the admin predicate won't propagate), not a live bypass. Fix: call
`supabase.rpc("has_role", {_user_id, _role:"admin"})` like notify-applicant-status:380 already does.
NOTE/REFUTE: matrix flagged `notify-applicant-status` and `notify-critical-fix` as hand-rolled — REFUTE
(the former uses the has_role RPC; the latter's `user_roles` read is a push-recipient lookup, not an authz gate).

**M4 — inline CORS omits `x-trace-id`/`x-request-id` on browser-invoked functions (availability drift,
grandfathered).** `promote-to-admin:11-15`, `notify-class-published:15-19`, `rate-limit:17-21` (plus the
public-* cross-site feeds) hand-roll an allow-list without the trace headers `invokeEdge` attaches. Per
`decisions.md §5` / `functions/CLAUDE.md`, these fail the CORS preflight the moment the client call migrates
to `invokeEdge` (FunctionsFetchError, zero edge logs). Highest concern: promote-to-admin (privileged, admin
UI) and rate-limit (pre-auth browser). Already tracked in `no-inline-cors-grandfather.json`. Fix: import
`corsHeaders` from `_shared/http.ts` (promote-to-teacher already does).

### LOW

**L1 — §8 violation: `error.message` returned in the response body** (log it, return static). CONFIRMED:
`preview-transactional-email:93`, `prewarm-ugc-worker:137`, `process-notification-fanout:98`,
`quest-nudge:56`, `reap-class-module-orphans:49,60`, `reconcile-stuck-emails:40`. All reachable only by
service-role/LOVABLE-key/admin callers, so exposure is to privileged clients → LOW, but still a §8 breach
(DB/internal error text). Fix: return a static message via the shared error owner, keep the real error in logs.

**L2 — non-timing-safe service-key comparison.** `quest-nudge:36` and `prewarm-ugc-worker:96` do
`auth !== \`Bearer ${SERVICE_KEY}\`` (plain `!==`) while `_shared/service-role-auth.ts` provides
`timingSafeEqualStr`. LOW (network timing side-channel on a bearer compare is impractical here). Fix: route
through `authorizeServiceRoleRequest` like the other cron workers.

**L3 — record-auth-recovery reflects any Origin with `Access-Control-Allow-Credentials: true`**
(`:81-90`). Negligible: it returns 204 with no body and reads no cookie/session, so there is nothing for a
cross-origin reader to steal. Note only.

**L4 — rate-limit fails OPEN on RPC error** (`:104`, returns `allowed:true`). Deliberate availability choice
(documented), but a `check_rate_limit` outage disables brute-force protection platform-wide. Accept or add a
degraded-mode alert.

**L5 — public-project-detail / public-project-openings use the service-role client (RLS bypass) and rely
solely on hand-curated SELECT lists** (`public-project-detail:45`, `public-project-openings:38`). Currently
safe (curated + scrubJson + WAF), but a future column added to the SELECT leaks with no RLS backstop.
Defense-in-depth note; public-classes (anon key + RLS) is the safer model.

## Verdicts

- **promote-to-admin / promote-to-teacher authz: SOUND.** Non-admin → 403; self-promotion blocked;
  two-step email confirmation; admin promotion additionally requires fresh aal2 2FA. Gaps are M1 (teacher
  lacks step-up) + M3 (hand-rolled predicate) — hardening, not a bypass.
- **public-* column exposure: MOSTLY SOUND.** Curated SELECTs + `scrubJson` DLP + WAF (on the two project
  endpoints). One real concern: `clients.primary_contact` + staff names reachable by anon (M2).
- **err-leak CONFIRM/REFUTE:** CONFIRMED 6 (preview-transactional-email, prewarm-ugc-worker,
  process-notification-fanout, quest-nudge, reap-class-module-orphans, reconcile-stuck-emails). REFUTED 5
  matrix flags (notify-applicant-status, process-email-queue, process-freescout-events, rate-limit,
  record-auth-recovery — errors are console-logged/DLQ'd, responses are static; the matrix regex matched
  `err.message` in logging/retry paths, not response bodies).

## Limitations
- Static read only; no runtime/dynamic testing, no DB schema inspection. M2 hinges on the real contents of
  `clients.primary_contact` (not verified).
- Did not read the full 738 lines of process-email-queue body (read auth + top ~180 + helpers); the service-
  role gate and static response shaping were confirmed, the lane-processing middle was skimmed.
- `scrubJson`/`applyWaf`/`has_role` internals assumed correct from their contracts, not line-audited here.
