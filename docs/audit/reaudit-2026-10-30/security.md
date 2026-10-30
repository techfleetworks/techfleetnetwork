# Security re-audit (OWASP secure coding): TechFleet Network

- **Date:** 2026-10-30
- **Target:** `C:\Users\morga\Documents\tfn-reaudit`, HEAD `e4c366190af4aa6765ff55b82fbd7920509aa86d` (2026-10-17), read-only
- **Dimension:** edge functions (`supabase/functions/**`, including `_shared`), frontend auth/session/input handling (`src/**`), dependencies and supply chain
- **Standards used:** `owasp-secure-coding-bdd/SKILL.md`, plus `skeptical-audit/references/evidence-discipline.md`
- **Method:** static source review with Grep/Read. I also ran 5 repo guards with `node scripts/ci/<guard>.mjs`. I did not run the app, Deno, vitest, or any prod or staging query.

---

## Score: 78 / 100. Band: enterprise-ready with gaps (75-89)

**Change from the prior 85: down 7.** This is **not** mainly a regression. Most of the drop comes from three things:

1. **One new High** that the prior audit missed. Session revocation does not revoke anything on the server (SEC-1). This code was already there at the baseline.
2. **The current skill is stricter.** A security control with no executable `@security` scenario in CI now counts as `not-assessed` (SEC-9). Edge-function supply chain is now in scope (SEC-5).
3. **A prior "fixed" claim holds only in part.** The §8 error-leak fix (#428) has a gate with a blind spot: 8 leak sites still ship (SEC-3).

There was also real improvement since 10-09. #428 cleaned up most of the error leaks. #429 added a blocking role-authz guard. #433 added a Braintrust compliance gate that fails safe. And prior M3 turns out to have been closed before the baseline (see the prior-findings table).

| # | Sub-criterion | Weight | Prior | Now | Why it moved |
|---|---|---|---|---|---|
| 1 | Access control / authz / session | 25% | 80 | 72 | SEC-1 (revocation works only on the client); promote-to-teacher and the 26 hand-rolled checks still open |
| 2 | Injection / XSS / input validation | 20% | 92 | 89 | All 22 HTML sinks sanitized (observed); CSP allows `script-src 'unsafe-inline'` (SEC-10) |
| 3 | Secrets / crypto / error leakage | 15% | 78 | 72 | SEC-3 gate blind spot; 98 files read the service-role key directly (was ~95); plaintext role tokens at rest (SEC-11) |
| 4 | SSRF / upload / deserialization / redirect | 15% | 90 | 88 | material-fetch and guide-ingest still `redirect:"error"`; freescout-proxy has an IDOR check (observed) |
| 5 | LLM / Fleety / AI spend | 15% | 90 | 82 | Anyone can drain the translation LLM budget by spoofing an IP header (SEC-4); Fleety rate limit fails open; clients can forge assistant-role history (SEC-12) |
| 6 | Dependencies / CORS / headers / supply chain / test evidence | 10% | 82 | 66 | Edge deps float, have no lockfile, and nothing scans them (SEC-5); `@security` BDD scenarios are not executable (SEC-9) |

Weighted total: 18.0 + 17.8 + 10.8 + 13.2 + 12.3 + 6.6 = **78.7, rounded down to 78** because of the `not-assessed` BDD evidence (SEC-9).

---

## Findings

Fixes follow this shape: **prevent by construction → fail-closed gate → discrimination test** (a test that proves the gate catches the bad case).

### HIGH

#### SEC-1: Signing out all devices, admin revoke, and emergency global sign-out do not invalidate sessions on the server

- **Files:**
  - `supabase/functions/sign-out-all-devices/index.ts:109-112`
  - `revoke-user-sessions/index.ts:69`
  - `admin-sign-out-all-users/index.ts:68`
  - `finalize-password-reset/index.ts:107`
  - `src/features/auth/services/session.service.ts:302-321`

- **What is wrong (two defects that add up):**
  1. **The GoTrue call is given the wrong argument.** All four handlers call `admin.auth.admin.signOut(<userId>, "global")`. In supabase-js v2, `GoTrueAdminApi.signOut(jwt, scope)` takes the user's **access-token JWT**, not a user id. A UUID sent as the bearer token cannot be a valid JWT, so the call should fail every time. Every call site treats that error as harmless:
     - sign-out-all-devices logs it as "non-fatal"
     - finalize-password-reset uses `.catch(() => undefined)`
     - admin-sign-out-all-users pushes every user into `failures`

     In sign-out-all-devices, `auth.token` (the caller's real JWT) is in scope (line 90) but is not used.
  2. **The only revocation that does take effect runs in the browser.** The "source of truth" `revoked_sessions` row is checked only by `is_session_revoked()` inside `session.service.ts` `getSession()`. That check also fails open in its catch (lines 316-321). Nothing on the server checks it:
     - `_shared/request-auth.ts` has no revoked or iat check (Grep: no matches).
     - No RLS policy references `is_session_revoked` (Grep over migrations: only the function definition and grants).
- **Why it matters:** an attacker with a stolen access or refresh token is not using our SPA. They call PostgREST and edge functions directly, so a check that runs in the browser never sees them. They keep access after:
  - the victim's "sign out everywhere"
  - an admin revoke
  - the emergency global sign-out

  Each of those endpoints reports success. This is OWASP Session Management: server-side invalidation. It also weakens incident response, because the kill switch does not work.
- **Disconfirming check (done first).** I looked for code that would mitigate this:
  - (a) a server-side revoked check in `request-auth.ts`: none
  - (b) RLS that uses `is_session_revoked`: none
  - (c) a caller that passes a JWT to `signOut`: none; all 4 pass a user id
  - (d) whether GoTrue itself revokes other refresh tokens on a password change: I could not verify this from code. If it does, it covers the password-reset path only. It does not cover self-revoke, admin revoke, or global sign-out.
- **Evidence:**
  - observed: all 4 call sites and the client-only check, at the file:line above
  - inferred: that the GoTrue call fails on every invocation, from the documented supabase-js signature
- **Re-run:**
  - `Grep "auth\.admin\.signOut" supabase/functions`
  - `Grep is_session_revoked supabase/migrations src supabase/functions`
- **Limitation:** I did not observe GoTrue responses or prod logs. The `gotrue_signed_out` field in the sign-out-all-devices response and log line (126-133) would show the real rate: `false` on every call would confirm this finding.
- **Smallest fix:**
  - **Prevent by construction:** one `_shared/session-revoke.ts` owner that does two things:
    - writes `revoked_sessions`
    - for self-service calls, passes the **caller's JWT** to `admin.signOut`. For admin or other-user calls, it uses a SECURITY DEFINER RPC that deletes `auth.refresh_tokens` and `auth.sessions` for the target user id.

    Then enforce revocation on the server: add an `is_session_revoked(sub, iat)` check in `requireAuthenticatedRequest`, and in a shared RLS helper for sensitive tables.
  - **Fail-closed gate:** a CI guard that bans `admin.signOut(` outside the owner.
  - **Discrimination test:** a test that calls the owner with a user id and expects a type or test failure. Plus a pgTAP test proving the RPC deletes the refresh tokens.
  - **@security scenario:** "Given a stolen refresh token, When the user signs out all devices, Then a token refresh with the stolen token is rejected".

### MEDIUM

| ID | File:line | What | Why it matters | Evidence | Re-runnable source | Limitation | Smallest fix |
|---|---|---|---|---|---|---|---|
| **SEC-2** | `login-with-captcha/index.ts:125-151`; `verify-turnstile/index.ts:33-81`; `_shared/auth-hosts.ts:11-23` | Still open from the prior audit. If the **Origin/Referer** header is not a production host, both endpoints fall back to Cloudflare's always-pass test secret `1x000…AA`. Any non-browser client can set those headers. **New:** neither endpoint has a caller. `sign-in.service.ts:4-8` says the active login does not use `login-with-captcha`, and `verifyTurnstileToken` (`src/lib/turnstile-verification.ts:6`) is never imported. login-with-captcha calls the GoTrue password grant **without** a captcha token (line 166-174), so either GoTrue captcha is off (the edge captcha adds nothing) or the function is broken. Both are still deployed with `verify_jwt=false` (`config.toml:168,174`). | Dead pre-auth endpoints that can bypass the captcha. login-with-captcha returns a full session. If GoTrue captcha is off, it is an extra password-login path whose captcha does nothing. | observed (code + no callers); inferred (GoTrue captcha state) | `Grep "TEST_SECRET" supabase/functions`; `git grep -n "login-with-captcha\|verifyTurnstileToken" -- src public e2e` | GoTrue captcha setting is in the Supabase dashboard, not in the repo; not observed | Delete both functions and `turnstile-verification.ts` (prevent). Add a CI guard banning the literal `1x0000000000000000000000000000000AA` in `supabase/functions` (gate), with a smoke test that plants it and expects failure (discrimination). Confirm GoTrue captcha is ON in the dashboard (runtime). |
| **SEC-3** | `dsar-submit/index.ts:70`; `record-consent/index.ts:111`; `record-policy-acknowledgment/index.ts:62`; `admin-sign-out-all-users/index.ts:48,63,69,81`; `reap-class-module-orphans/index.ts:49`; `auth-email-hook/index.ts:339-340` | The #428 leak fix has a gate blind spot. `check-no-error-in-edge-response.mjs:96-99` scans only `jsonResponse(` and `new Response(` spans. A local `json(...)` wrapper that returns `{ error: error.message }` passes. The guard also misses an error stored in a variable first (`const message = error.message; json({error: message})`). I found 8 sites that return PostgREST/GoTrue/caught error text. The guard exits 0. | Leaks internals (constraint, function, and column names) to members, for example on the DSAR and consent endpoints. Worse, a green gate claims the §8 rule is enforced when it is not. | observed (guard run: `OK — 169 files`, while these sites exist) | `node scripts/ci/check-no-error-in-edge-response.mjs`; `Grep "\b(json\|respond)\s*\(\s*(\d+\s*,\s*)?\{[^}]*\b\w*[Ee]rr\w*\.message" supabase/functions` | Regex sweep; there may be more variants | Route through `errorResponse` (prevent). Widen the guard to any call whose callee returns `new Response(JSON.stringify(...))`, or ban local `json(` wrappers in favor of `jsonResponse` (gate). Add a smoke fixture `json({ error: rpcErr.message })` that must fail (discrimination). |
| **SEC-4** | `_shared/translation-guard.ts:73`; also `record-auth-recovery/index.ts:102`, `record-auth-wedge/index.ts:66`, `get-community-events/index.ts:110` | The translation LLM rate limit for anonymous callers is keyed on the **leftmost `X-Forwarded-For`** value, which the client controls. This skips the hardened shared owner `_shared/client-ip.ts` (cf-connecting-ip first, then the last XFF hop). The limiter also **fails open** (lines 81-84). Any holder of the public anon JWT can rotate XFF and call `translate-strings` (200 strings × 2000 chars per call) without limit. No WAF is applied there. The 3 other sites key in-memory telemetry limits the same way. | Denial of wallet: an attacker can drain the shared LLM key (the same H15 risk the guard was meant to close). Also lets anyone spam cache rows in `i18n_translations`. | observed (code); inferred (XFF can be set by the client at the Supabase edge) | `Grep "x-forwarded-for" supabase/functions` | Did not test whether Supabase's gateway rewrites XFF | Replace with `clientIp(req)` from `_shared/client-ip.ts` (prevent). Add a guard banning `headers.get("x-forwarded-for")` outside `_shared/client-ip.ts` (gate), with a test that plants it and expects failure (discrimination). Make the translation limiter fail closed, or add a global daily spend cap. |
| **SEC-5** | 65 files import `npm:@supabase/supabase-js@2` (major version only); `fleety-extract/index.ts:22` imports `npm:unpdf` (**no version**); `process-email-queue/index.ts:2` imports `npm:@lovable.dev/email-js` (no version in the file); `https://esm.sh/...` imports remain | Edge-function dependencies resolve to **whatever is newest at deploy time**. No `deno.lock` is committed (only 7 per-function `deno.json` files plus the root). `deploy-edge-functions.yml` has no lock or frozen flag. `npm audit` and Dependabot cover **npm only** (`.github/dependabot.yml` has no Deno ecosystem). So the ~125 server functions that hold the service-role key run dependencies that nothing scans or pins. `unpdf` parses member-uploaded PDFs. | Supply-chain risk (OWASP A03:2025): a compromised or broken minor release of supabase-js, or any release of unpdf, ships straight to prod with the service-role key in reach. | observed | `Grep 'from "npm:(@[^/"]+/)?[^@"]+"' supabase/functions`; `Grep '"npm:@supabase/supabase-js@2"' --count`; `git ls-files \| Select-String deno.lock` | Did not check whether Supabase's bundler pins on its own | Pin exact versions through one import map (`supabase/functions/import_map.json` or a root `deno.json` `imports`) and commit `deno.lock` (prevent). Add a CI guard that fails on any `npm:`/`jsr:`/`esm.sh` specifier without an exact `x.y.z` (gate), with a fixture `npm:foo@2` that must fail (discrimination). Add `osv-scanner` over `deno.lock`. |
| **SEC-6** | `public-project-detail/index.ts:61,108-127` | Still open from the prior audit (M-anon-pii). This anonymous endpoint (`verify_jwt=false`, `config.toml:72`) returns `clients.primary_contact` and the coordinator's full `first_name`/`last_name`/`display_name` plus `coordinator_id`. `scrubJson` strips emails and UUIDs, not names. It is also mislabeled `// @edge-cron`. | Personal data of staff and client contacts is exposed to anyone, and can be enumerated per project id. | observed | Read the file | Whether `primary_contact` holds a name or an email in prod: not observed | Drop `primary_contact` and return coordinator display_name only, or nothing (prevent). Add an edge contract test asserting the response keys match an allow-list (gate plus discrimination). |
| **SEC-7** | `promote-to-teacher/index.ts:67-80` | Still open from the prior audit. There is no `requireFreshAdmin2fa` step-up; `promote-to-admin` has one. The admin check is still a hand-rolled `user_roles` read. It is grandfathered in `scripts/ci/no-inline-role-authz-grandfather.json:21`. | A stolen admin session can grant the teacher role without 2FA. This is mitigated: the target must confirm with their own JWT (`confirm-teacher-role` uses a hashed token, expiry, single use, and an owner check, observed). | observed | Read; `node scripts/ci/check-no-inline-role-authz.mjs` → `28 grandfathered … 0 new` | none | Switch to `requireAdminRequest` + `requireFreshAdmin2fa` and remove the entry from the grandfather list (gate shrinks). |
| **SEC-8** | 26 grandfathered files (`no-inline-role-authz-grandfather.json`); 49 inline-CORS functions; 98 files read the service-role key directly | Still open from the prior audit, now behind ratchets. The role-authz and CORS guards block **new** cases (observed exit 0). The direct service-role-key reads grew from ~95 to 98 files, and **no guard ratchets them**. | The single-owner invariant (`supabase/functions/CLAUDE.md`) is still not true. | observed | `Grep 'Deno\.env\.get\(["']SUPABASE_SERVICE_ROLE_KEY["']\)' --count` → 109 hits / 98 files; `node scripts/ci/check-no-inline-cors.mjs` → 49 grandfathered | none | Add a shrink-only guard for direct `SUPABASE_SERVICE_ROLE_KEY` reads, the same pattern as `no-inline-cors-grandfather.json`, then burn it down. |
| **SEC-9** | 10 `.feature` files spread across `src/features/auth/` and `supabase/functions/*/`; scenarios are also stored as text in the `bdd_scenarios` table via migrations; `package.json` has no cucumber or BDD runner | The current skill requires every security control to ship an **executable** `@security` scenario in one shared index that blocks in CI. There are 76 `@security` tag lines across 10 files, but there is no shared index, no runner, and no CI job that executes them. `check-owasp-coverage.mjs` maps 120 sheets; the skill catalog now has 137. | Under the skill, every control here is `not-assessed` for "tested", whatever the vitest coverage. Security regressions are guarded only by unit tests and bespoke guards. | observed | `git ls-files "*.feature"`; `Select-String package.json cucumber` (none) | Vitest may test the same behaviors under other names; not mapped one-to-one | Make one `features/` index and wire a cucumber-js runner into CI. Adopt `check-security-coverage.mjs` from the skill with the TFN surface config. Each SEC-n fix above adds its scenario. |

### LOW

| ID | File:line | What | Evidence | Fix |
|---|---|---|---|---|
| **SEC-10** | `public/_headers` (the `/*` CSP line) | CSP `script-src` and `script-src-elem` include `'unsafe-inline'`, which weakens the last line of XSS defense. `connect-src` allows `ai.gateway.lovable.dev` and `api.firecrawl.dev`, but `src/` never calls them from the browser (only through the `firecrawl-search` edge function), so these are unneeded origins. | observed | Nonce- or hash-based scripts (Vite plugin), and drop the unused connect-src origins. Pin the header with a Playwright header assertion. |
| **SEC-11** | `migrations/20260502160408_…sql:6` and `20260809120000_…sql:65-82`; same for admin (`20260418032018_…sql:81-98`) | The "hash-at-rest" fix (H13) adds `token_hash`, but the trigger **does not null the plaintext `token`** (`NOT NULL DEFAULT random`). Plaintext role-confirmation tokens stay readable by admins (`"Admins can view all teacher promotions"`) and by the owner. Impact is limited because confirmation also needs the target's JWT (observed). | observed (migration source); prod schema not queried | The trigger sets `NEW.token := NULL` after hashing (expand: drop NOT NULL first), then a contract migration drops the column. pgTAP test: the plaintext column is null after insert. |
| **SEC-12** | `techfleet-chat/index.ts:679-732` | The client can send `assistant`-role history turns (only `system` is stripped), so it can forge "prior assistant" turns to steer the model (LLM01). The per-user quota (line 797-803) and system rate limit (810-820) both **fail open** on RPC error. Mitigations observed: no side-effect tools (the only tool is the forced `route` classifier, line 479-513), output sanitized, canary. | observed | Rebuild history from the persisted `chat_messages` by `conversation_id`, not from the client. Fail closed or degrade on a quota RPC error. |
| **SEC-13** | `screen-sanctions/index.ts:42-74` | Anonymous, rate-limit-free sanctions screening on a **country the user reports themselves**. Anyone can write unlimited `sanctions_screenings` rows with arbitrary emails. The compliance control trusts the client. | observed | Derive the country on the server (`cf-ipcountry`), apply `applyWaf`, and bind the screening to the signup. |
| **SEC-14** | `quest-nudge/index.ts:36-37`, `send-push-notification:42`, `email-octopus-sync:29`, `prewarm-ugc-worker:96`, `auth-email-hook:135` | Service-key or secret compared with `!==`, which is not constant-time. In quest-nudge the key uses `!`, so an unset env would accept the literal `Bearer undefined`. Supabase always injects the key, so this is theoretical. | observed | Use `_shared/service-role-auth.ts#authorizeServiceRoleRequest` everywhere (it already exists and 9 functions use it). |
| **SEC-15** | `.github/workflows/security.yml:11` | The comment says CodeQL is `.github/workflows/codeql.yml`; that file is not in the repo. CodeQL may run through GitHub default setup (35 alerts were fixed per #350). | observed (file absent); not-assessed (repo settings) | Commit `codeql.yml` or fix the comment; confirm it is a required check. |

---

## Prior findings: status

| Prior ID | Status now | Evidence |
|---|---|---|
| M1: service-role key read directly (~95 files) | **OPEN (slightly worse)**: 98 files / 109 reads; no ratchet guard → SEC-8 | observed: Grep count |
| M2 / M-authz: hand-rolled role checks; promote-to-teacher has no 2FA | **CHANGED**: new reads are now blocked by `check-no-inline-role-authz.mjs` (#429, exit 0, 28 grandfathered reads in 26 files); promote-to-teacher still has no step-up → SEC-7 | observed: guard run + Read |
| M3: `exploration_cache` / `chunk_stale_log` permissive RLS | **CLOSED, and already closed at the baseline (prior false positive)**. `20260412202556` and `20260412205039` drop the authenticated insert/update policies (service role only). `20260531041335` revokes anon insert on `chunk_stale_log` and adds a 100/hr trigger cap. The prior audit read only the creating migrations. | observed: migration Grep; limitation: prod policy state not queried |
| M-controls: captcha test-secret bypass by Origin | **OPEN, reframed**: both endpoints are now dead code with no callers → SEC-2 | observed |
| M-anon-pii: public-project-detail | **OPEN** → SEC-6 | observed |
| M-cors / L1: inline CORS, `*` | **OPEN, ratcheted**: 49 grandfathered, 76 compose the shared owner; `x-trace-id` guard green on 36 browser-invoked functions. `*` is acceptable because there is no `Allow-Credentials` and auth is a bearer token. | observed: 2 guard runs |
| L2: missing `x-trace-id` | **CLOSED** for browser-invoked functions (`check-edge-cors-trace.mjs` OK) | observed |
| L3: Gumroad secret in the query string | **OPEN (accepted)**, unchanged (not re-read in full) | documented by the prior audit |
| §8 error leaks (fixed by #428) | **PARTIALLY CLOSED**: the guard is green but has a blind spot; 8 leak sites remain → SEC-3 | observed |
| S2: Fleety has no tools | **CHANGED, still safe**: there is now one forced `route` tool (a classifier with a closed enum schema, no side effects). Its `needsWeb`/`webQuery` output is never used (Grep). | observed |
| Braintrust PII egress (ADR-0073, C2/H7) | **MITIGATED**: `braintrustEnabled()` returns false unless `BRAINTRUST_COMPLIANCE_READY` is affirmed (`_shared/observability/braintrust.ts:121-146`); secrets scrubbed; flush is bounded and fails open | observed (code); not-assessed (prod env values) |

---

## Strengths I re-verified (credit)

- **HTML sinks:** all 22 `dangerouslySetInnerHTML` sinks in `src/` go through `sanitizeHtml`/DOMPurify. The `chart.tsx` one is shadcn's static style. Observed via Grep and context.
- **Webhooks:** signatures are verified before any write. `auth-email-hook` uses standardwebhooks (`:185-189`) and `resend-webhook` uses svix (`:56-67`).
- **Role confirmation:** `confirm-teacher-role` does hashed-token lookup, expiry, single-use claim, and an owner JWT check, through the pure `evaluateConfirmation`.
- **IDOR:** `freescout-proxy` checks ownership with `ownsConversation` (`:168-193`) and URL-encodes the path.
- **Shared IP owner:** `_shared/client-ip.ts` is correct. Several callers just don't use it (SEC-4).
- **Security headers:** `public/_headers` sets HSTS preload, `frame-ancestors 'none'`, COOP/CORP, `object-src 'none'`, and a Permissions-Policy.
- **Dependency gate:** the npm gate is blocking with dated waivers, and the secret-scan gate is blocking (`security.yml`).

---

## Coverage

- **Read in full:**
  - `login-with-captcha`, `verify-turnstile`, `promote-to-teacher`, `confirm-teacher-role`, `public-project-detail`
  - `_shared/observability/braintrust.ts`, `write-exploration-cache`, `screen-sanctions`, `dsar-submit`, `admin-sign-out-all-users`
  - `_shared/translation-guard.ts`, `check-no-error-in-edge-response.mjs`, `public/_headers`, `.github/dependabot.yml`
  - the 2 teacher-token migrations
- **Read in part:**
  - `techfleet-chat/index.ts` (lines 440-540 and 575-875 of about 2200)
  - `sign-out-all-devices` (1-135), `fleety-extract` (1-140), `auth-email-hook` (125-175, 315-344), `freescout-proxy` (160-220)
  - `sign-in.service.ts`, `sign-up.service.ts`, `session.service.ts` (280-330)
- **Covered by Grep sweeps across all ~125 functions:**
  - service-role reads, inline CORS, XFF, `signOut`, unpinned imports, error-in-response, fetch sinks
  - `verify_jwt=false` inventory: 106 functions. I spot-checked auth in 20 of the 41 that my heuristic flagged.
- **Guards run:**
  - `check-no-inline-role-authz` (exit 0)
  - `check-no-error-in-edge-response` (exit 0, blind spot shown)
  - `check-no-inline-cors` (exit 0)
  - `check-edge-cors-trace` (exit 0)
  - `check-owasp-coverage` (exit 0)
- **Commits since the baseline:** reviewed through `git log --since=2026-10-09 -- supabase/functions src` (20 commits; the security-relevant ones are #428, #429, #433, #413).
- **Not assessed:**
  - the other ~100 edge functions line by line
  - RLS predicate bodies, the bodies of the `has_role` and `submit_dsar` RPCs
  - Gumroad and discord-oauth flows (unchanged since the prior batch review)
  - prod runtime: GoTrue captcha setting, CSP as served, branch-protection required checks, the Braintrust env, GoTrue `signOut` responses

## Limitations

1. **Static only.** SEC-1's "GoTrue signOut always fails" and SEC-4's "XFF can be set by the client" are **inferred** from documented SDK and proxy behavior, not observed at runtime. The cheapest upgrade is to read the `gotrue_signed_out` field in sign-out-all-devices logs, and to send one `translate-strings` request with a forged XFF against staging.
2. **Partial view of the migrations.** I traced migrations only for the tables named here. The prod schema may differ (repo memory notes migrations are hand-applied and prod has no ledger).
3. **Regex gaps.** My error-leak and unpinned-import sweeps are regex-based. Counts are lower bounds.
4. **Shell flakiness.** The OneDrive and msys environment kept me on Grep/PowerShell. I did not run Deno or vitest, so I did not execute any of the repo's own security tests.

## Fixes that need NO prod secrets, staging, or runtime access (pure code + CI gate)

- SEC-1 code part: a shared revoke owner that passes the JWT or uses an RPC, a server-side `is_session_revoked` check in `requireAuthenticatedRequest`, a guard banning raw `admin.signOut(`, and a pgTAP test.
- SEC-2: delete the two dead captcha endpoints plus a guard banning the test-secret literal.
- SEC-3: widen the error-leak guard and fix the 8 sites.
- SEC-4: use `clientIp()` plus a guard banning raw XFF; make the translation limiter fail closed.
- SEC-5: exact-version import map, committed `deno.lock`, a pin guard, and OSV scan in CI.
- SEC-6, SEC-7, SEC-8, SEC-10, SEC-11, SEC-12, SEC-13, SEC-14, SEC-15: all code, migration, or guard changes.
- SEC-9: shared feature index plus a cucumber runner job.

## Fixes blocked on runtime or prod access

- **SEC-1:** verify it in prod. Check `gotrue_signed_out` rates, and decide whether GoTrue revokes sessions on a password change. The migration that adds the refresh-token-delete RPC is hand-applied to prod.
- **SEC-2:** confirm GoTrue captcha is ON in the Supabase dashboard, then undeploy the functions in prod.
- **SEC-11:** the migrations must be hand-applied.
- **Braintrust:** keep `BRAINTRUST_COMPLIANCE_READY` unset until the DPA, retention, and deletion cascade are live.
- **SEC-15:** branch protection and required checks are repo settings.
