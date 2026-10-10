# Edge batch 01 — deep per-function security review

Reviewer: skeptical app-sec engineer. READ-ONLY. Root: `C:/Users/morga/Documents/tfn-audit`.
Scope: 19 functions (SSRF/external-fetch + Fleety ingest cluster). verify_jwt from `supabase/config.toml`.

## (a) Per-function table

| function | classification (intended?) | authN ok? | authZ / IDOR | input-valid / SSRF | err-leak confirmed? | worst issue |
|---|---|---|---|---|---|---|
| environment-readiness | ADMIN/SERVICE (yes, jwt=false, in-code) | YES — svc-role OR admin JWT via has_role | presence-booleans only, no secret values | n/a (no fetch) | NO (matrix "·" correct) | hand-rolled role flag = false-positive (uses has_role RPC) |
| eo-contact-status | USER-AUTH self-only (yes, jwt=true) | YES — getUser | STRONG: email from identity, never param | n/a (EO server-side) | NO ("·" correct) | no top-level try/catch (wrapper covers) |
| fetch-class-certifications | USER-AUTH self-only (yes, jwt=false in-code) | YES — getClaims | self: email from JWT claims, rows keyed to userId | Airtable host hardcoded; formula value escaped | **YES (line 315)** | **err-leak: returns error.message incl. Airtable body** |
| fetch-project-certifications | USER-AUTH self-only (yes) | YES — getClaims | self (same as above) | same | **YES (line 312)** | **err-leak: returns error.message incl. Airtable body** |
| fill-content-gaps | ADMIN (yes, jwt=false in-code) | YES — getUser + user_roles | admin-gated; tables allow-listed | prompt-injection low (admin ref-data; output review-flagged) | **NO — REFUTE** (e.message only in console.warn) | hand-rolled role (user_roles direct, L152) |
| finalize-password-reset | USER-AUTH recovery (yes, jwt=false in-code) | YES — requireAuthenticatedRequest | self (own recovery JWT) | zod password 8–512 | **NO — REFUTE** (classifyUpdateError → static msgs; errorResponse shared) | none material — well built |
| firecrawl-search | USER-AUTH (yes, jwt=false in-code) | YES — Bearer+getUser | any authed user (intended search) | query (not URL); target api.firecrawl.dev hardcoded | NO ("·" correct) | no per-user rate limit (cost) — LOW |
| fleety-embed | USER-AUTH + svc/cron/admin (yes, jwt=false) | YES | Mode A any user; backfill svc/cron/admin | Gemini host hardcoded; Mode C table regex `^reference_` | **YES (line 381)** | **err-leak e.message + hand-rolled role (user_roles L119)** |
| fleety-extract | USER-AUTH (yes, jwt=false in-code) | YES — getUser + rate limit | self | Gemini hardcoded; magic-byte type; 10MB cap; vision prompt frames data | NO ("·" correct) | inline CORS omits x-trace-id (avail) — LOW |
| fleety-learning-digest | SERVICE-CRON or admin (yes, jwt=false) | YES — svcRole OR admin JWT | svc/admin | LLM host hardcoded; drafts inactive/review | **YES (line 134)** | **err-leak error.message + hand-rolled role (user_roles L113)** |
| fleety-review | USER-AUTH (yes, jwt=true) | YES — getUser | self | **SSRF-guarded** via `_shared/material-fetch.ts` (allow-list+redirect:error+bounds) | NO ("·" correct) | none material — well built |
| fleety-weekly-digest | SERVICE-CRON (yes, jwt=false) | YES but **bespoke `auth !== Bearer+KEY`** (not constant-time/shared) | svc only | n/a | NO ("·" correct) | bespoke non-shared svc-role compare (L23) |
| framework-csv-fetch | ADMIN (yes, jwt=false in-code) | YES — getUser + has_role | admin; filename regex blocks traversal | storage (no SSRF); filename `^[A-Za-z0-9._-]+\.csv$` | **YES (line 84, dlErr.message)** | err-leak storage detail (admin-only) — LOW |
| freescout-provision-admin | ADMIN (yes, jwt=true) | YES — requireAdminRequest | target-must-be-admin re-check | zod; no fetch host from user | NO ("·" correct) | hand-rolled flag = false-positive (requireAdminRequest used) |
| freescout-provision-customer | SERVICE (yes, jwt=true) | YES — authorizeServiceRoleRequest | svc only | zod uuid | NO ("·" correct) | none |
| freescout-sync-customer | SERVICE (yes, jwt=true) | YES — authorizeServiceRoleRequest | svc only | zod | NO ("·" correct) | none |
| freescout-proxy | USER-AUTH + admin actions (yes, jwt=true) | YES — requireAuthenticatedRequest | STRONG triple-gate: JWT→role→ownership | zod discriminated union; path uses encoded int id; freescout host = constant | **YES (line 537, by design)** | returns FreescoutError.message+upstream body (intentional) — LOW |
| freescout-validate-secret | ADMIN (yes, jwt=true) | YES — authed + has_role | admin; candidate key not persisted | FREESCOUT_BASE_URL constant (no SSRF) | NO ("·" correct) | none |
| freescout-webhook | WEBHOOK (yes, jwt=false) | YES — HMAC verify | n/a | 256KB cap; HMAC; dedupe anti-replay | NO ("·" correct) | none — solid |

## (b) Findings

### MEDIUM
- **M1 fetch-class-certifications** `fetch-class-certifications/index.ts:314-315` — `error.message` returned in 500 body. The thrown Airtable error embeds upstream response body (`errBody.slice(0,500)`, L43) → leaks Airtable base/table structure + config-state ("AIRTABLE_PAT is not configured") to any authed member. §8 violation. Evidence: read+quoted. Fix: `return errorResponse` pattern / static message, log real error.
- **M2 fetch-project-certifications** `:311-312` — identical to M1 (L45 errBody). Same fix.
- **M3 fleety-embed** `fleety-embed/index.ts:380-381` — 500 returns `e instanceof Error ? e.message` (Gemini error incl. 200-char provider body, DB errors). Also **hand-rolled admin check** `:119-123` queries `user_roles` directly (CLAUDE.md "No inline admin checks"). Fix: static error; use shared `has_role`/`requireAdminRequest`.
- **M4 fleety-learning-digest** `fleety-learning-digest/index.ts:133-137` — 500 returns `error.message` (DB). Also **hand-rolled admin check** `:113-117` (`user_roles` direct). Admin/svc-only → lower blast radius. Fix: static msg + shared predicate.
- **M5 fleety-weekly-digest** `fleety-weekly-digest/index.ts:23` — bespoke `auth !== \`Bearer ${SERVICE_ROLE}\`` string compare for authz. Not constant-time and does NOT use the shared `authorizeServiceRoleRequest` the sibling Fleety cron fns use → inconsistent + fragile to Supabase key-format rollover (sb_secret_*). Fix: `authorizeServiceRoleRequest(req)`.

### LOW
- **L1 framework-csv-fetch** `:84` — 404 body `detail: dlErr?.message` leaks storage error (admin-only). Also inline `has_role` rather than `requireAdminRequest` (functionally fine).
- **L2 freescout-proxy** `:537` — returns `FreescoutError.message` + `upstream: e.body`. Deliberate upstream-support-error surfacing; could expose Freescout-side detail. Scope to generic message if upstream body is sensitive.
- **L3 fleety-extract** `:38-42` — inline CORS allow-list omits `x-trace-id`/`x-request-id`; if ever called via `invokeEdge` the preflight fails (availability). Source CORS from `_shared/http.ts`.
- **L4 fleety-embed Mode A** — single-embedding path open to any authenticated user with no per-user rate limit (cost/abuse). Add rate limit.
- **L5 hand-rolled-role class** — environment-readiness, framework-csv-fetch, freescout-proxy, freescout-validate-secret use inline `has_role` RPC rather than `requireAdminRequest`; freescout-provision-admin flag is a false-positive (it DOES use requireAdminRequest). Consistency, not a vuln.

### SSRF verdict (the fetchers)
- **fleety-review / techfleet-chat material reads: SAFE.** `_shared/material-fetch.ts` enforces https-only, host allow-list (figma.com + subdomains via proper suffix match, guide.techfleet.org, techfleetworks.github.io), IP-literal + credentialed-URL rejection, `redirect:"error"`, 2MB + 12s bounds. No user-controlled host reaches an unguarded fetch.
- **firecrawl-search: SAFE** — user supplies a search *query*, not a URL; fetch target `api.firecrawl.dev` is hardcoded (the crawling of arbitrary web is Firecrawl's product function, server-side with its own key).
- **framework-csv-fetch / fetch-*-certifications: SAFE** — hosts are constants (Supabase storage / api.airtable.com); path ids are Airtable-origin, not user-origin; filename regex blocks traversal.
- **freescout-* : SAFE** — base URL is a constant (`_shared/freescout.ts`); conversation/customer ids are validated ints/encoded.

### err-leak flags confirmed vs refuted (matrix cross-check, my batch)
- CONFIRMED: fetch-class-certifications, fetch-project-certifications, fleety-embed, fleety-learning-digest, framework-csv-fetch, freescout-proxy (by-design).
- REFUTED (matrix false-positive — leaked text goes only to `console.*`/logs or is mapped to static messages): **fill-content-gaps** (e.message only in console.warn L129/225), **finalize-password-reset** (classifyUpdateError returns static strings; final catch uses shared errorResponse).
- "·" (no-leak) entries all correct for the rest.
