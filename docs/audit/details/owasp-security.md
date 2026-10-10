# OWASP Secure-Coding Audit — TechFleet Network

**Auditor dimension:** OWASP Top 10 + Cheat Sheet Series (authn/session, access control/IDOR,
injection, XSS, SSRF, secrets, deserialization, file upload, dependency risk, CORS, open redirect,
stack-trace/PII leakage, LLM/agent security).
**Target (READ-ONLY):** `C:/Users/morga/Documents/tfn-audit` — React/Vite/TS SPA + Supabase
(Postgres/PostgREST/GoTrue/RLS + ~125 Deno edge functions, 729 migrations). ~767 prod users.
**Date:** 2026-10-09. **Method:** static source review + grep; no app run, no prod query, no CI exec.

**Standard loaded:** `owasp-secure-coding-bdd/SKILL.md` + `ai-llm-agent-security.md`. Also read
`decisions.md` (esp. §8 untrusted content, §9 Fleety), `CLAUDE.md`, `supabase/functions/CLAUDE.md`,
the 2026-04-15 architecture-audit PDF context, `pentest-report/sast.md`, and
`security-advisories.waivers.json` — all **verified independently**, not trusted.

---

## Score: 85 / 100 — Band: enterprise-ready with gaps (75–89)

| # | Sub-criterion | Weight | Score | Rationale (short) |
|---|---|---|---|---|
| 1 | Access control / authz / IDOR / RLS | 25% | 80 | Strong shared helpers + RLS broadly on + prod-schema gate; inconsistent adoption, 2 permissive write policies |
| 2 | Injection / XSS / input validation | 20% | 92 | DOMPurify allow-list read+write-trigger, fixpoint stripper, zod+bounded parsing, SAST green |
| 3 | Secrets / crypto / error leakage | 15% | 78 | No stack leak, constant-time compares; service-role centralization **incomplete** (~95 direct reads) |
| 4 | SSRF / file upload / deserialization / redirect | 15% | 90 | Allow-listed SSRF fetch, `toSafeRedirectPath`, SVG ban, `safeJsonParse` |
| 5 | LLM / Fleety agent security | 15% | 90 | Textbook injection defense; no exposed tools; capability-denial blocking; US-residency pin |
| 6 | Dependency / CORS / headers / supply chain | 10% | 82 | Blocking dep gate w/ expiring waivers, security headers, SHA-pinned CI; CORS `*` permissive |

**Weighted total = 85.3 → 85.** This is a security-mature codebase with disciplined, test-pinned
gates (arch-gate, db-schema-present, OWASP-coverage, dependency-advisories, SAST). Deductions are for
consistency drift and a few residual permissive grants, not systemic exposure.

---

## Findings (ranked)

### HIGH
_None found._ No exploitable auth bypass, IDOR, injection, or secret exposure was identified in the
code paths reviewed. (See limitations — this is "none found in scope," not "none exist.")

### MEDIUM

**M1 — Service-role key read directly in ~95 edge functions, defeating the centralized owner.**
`decisions.md §5` and `_shared/admin-client.ts` (lines 1-88) establish `getAdminClient()` as the ONE
place to read `SUPABASE_SERVICE_ROLE_KEY` (memoized, env-validated, 90-day rotation-age warning).
In reality only a handful compose it; direct `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` appears in
**~95 function `index.ts` files**.
- Evidence: Grep `Deno\.env\.get\(["']SUPABASE_SERVICE_ROLE_KEY["']\)` under `supabase/functions` →
  matches incl. `promote-to-admin/index.ts:51`, `promote-to-teacher/index.ts:42`,
  `manage-discord-roles/index.ts:{86,124,353,382,458}`, `grant-observer-role/index.ts:74`,
  `delete-account/index.ts:70`, `revoke-user-sessions/index.ts:41`, etc.
- Evidence state: VERIFIED (grep). Impact: not a direct exposure (all read the same env var, so an
  env-level rotation still works), but it loses the owner's validation/age-warning, widens the blast
  radius of a copy-paste mistake, and contradicts the documented single-owner invariant. The
  docstring's "key rotation impossible" claim is now the *intent*, not the state.
- Smallest fix: burn-down to `getAdminClient()` via a shrink-only allowlist gate (same pattern as the
  CORS/audit-wrapper ratchets already in the repo).
- Re-run: `rg -c 'Deno.env.get\("SUPABASE_SERVICE_ROLE_KEY"\)' supabase/functions`.

**M2 — Inconsistent authorization: sensitive role-mutating functions hand-roll admin checks instead
of the shared `has_role` helper, bypassing the single authz predicate + audit.**
`supabase/functions/CLAUDE.md` states: *"No inline admin checks. Never query `user_roles` directly for
authz — use the shared `has_role`-backed helper."* Only **16 of ~125** functions import
`requireAdminRequest`/`requireAuthenticatedRequest`/`requireFreshAdmin2fa`.
- Evidence: Grep for those symbols → 16 files. `promote-to-teacher/index.ts:69-80` and
  `promote-to-admin/index.ts:80-92` both authorize via a direct
  `adminClient.from("user_roles").select("id").eq("role","admin")` query, not `has_role`.
- Secondary: `promote-to-teacher` has **no fresh-2FA step-up**, whereas `promote-to-admin`
  (`index.ts:94`, `requireFreshAdmin2fa`) does. Teacher is lower privilege, but it is still a
  privilege grant mutating `user_roles`.
- Evidence state: VERIFIED. Impact: the authz decision has multiple divergent copies; a future change
  to role semantics (expiry, hierarchy) in `has_role` won't propagate, and inline denials skip the
  `authz_admin_denied` audit emission `requireAdminRequest` provides. This is exactly the drift the
  repo's own rule forbids. The checks reviewed are *currently correct*, so this is consistency/
  defense-in-depth, not a live bypass.
- Smallest fix: route these through `requireAdminRequest`; add 2FA step-up to teacher promotion.

**M3 — Over-permissive RLS write policies allow cross-user / anonymous writes on two tables.**
- `migrations/20260322180458_...sql:19-29` — `exploration_cache`: `FOR INSERT TO authenticated
  WITH CHECK (true)` **and** `FOR UPDATE TO authenticated USING (true) WITH CHECK (true)`. Any
  authenticated member can insert or overwrite **any** row (cache poisoning / integrity, not keyed to
  owner). A dedicated `write-exploration-cache` edge fn exists, so the broad client policy is
  unnecessary surface.
- `migrations/20260530194518_...sql:14` — `chunk_stale_log`: `FOR INSERT TO anon, authenticated
  WITH CHECK (true)` — any anonymous caller can insert arbitrary log rows (spam / noise, mild DoS).
- Evidence state: VERIFIED (migration source). Impact: LOW-MEDIUM — integrity/noise, no PII read
  disclosed. Most other `WITH CHECK (true)` hits (56 across 34 files) are correctly scoped
  `TO service_role` (benign; service_role bypasses RLS regardless).
- Smallest fix: scope `exploration_cache` write policies to `user_id = auth.uid()` (or revoke client
  writes and keep the edge fn); add a cheap rate/shape constraint to `chunk_stale_log` or move it
  behind the service role.

### LOW

**L1 — CORS `Access-Control-Allow-Origin: *` is global.** The shared `_shared/http.ts:11-14`
inherits `*` from the SDK; several hand-rolled handlers (`promote-to-admin/index.ts:12`,
`techfleet-chat/index.ts:61`, `gumroad-webhook/index.ts:28`) also set `*`. Acceptable because auth is
**bearer-token, not cookie** (no `Allow-Credentials`), so a cross-origin page cannot obtain a victim's
JWT — but it is more permissive than necessary. Evidence: VERIFIED. Fix: reflect an allow-listed
origin (the app already has `isAllowedOrigin` in `src/lib/security.ts:855`).

**L2 — Hand-rolled CORS allow-lists omit `x-trace-id`.** `promote-to-admin` and `techfleet-chat`
inline an `Access-Control-Allow-Headers` list without `x-trace-id`, the exact drift `decisions.md §5`
warns causes silent preflight failures when a client migrates to `invokeEdge`. Evidence: VERIFIED
(`promote-to-admin/index.ts:13-14`, `techfleet-chat/index.ts:62-63`). Operational, not a vuln.

**L3 — Gumroad webhook secret is a URL query param.** `gumroad-webhook/index.ts:108` reads
`?secret=` (Gumroad offers no HMAC). It is **constant-time compared** + `seller_id` matched +
fail-closed audited (strong), but a secret in a query string can leak via proxy/referrer logs.
Evidence: VERIFIED. Given Gumroad's constraints this is the available mechanism; acceptable with a
note to prefer a header if Gumroad ever supports one.

---

## Genuine strengths (credit earned)

**S1 — Untrusted-content single-owner discipline (decisions.md §8), enforced + CodeQL-remediated.**
HTML sanitization uses a DOMPurify **strict allow-list** applied on BOTH render *and* a DB
write-trigger (`src/lib/security.ts:666-755`, `sanitize_user_html_trigger`), so even a compromised
admin token can't store CSS/HTML payloads. The no-DOM path uses a **fixpoint** stripper
(`stripTagsFixpoint`, `security.ts:65`) that defeats `<scr<script>ipt>` nesting (the CodeQL
`js/incomplete-multi-character-sanitization` remedy). `errorResponse` (`_shared/http.ts:84-92`)
**never** returns `error.message`/`stack`. `toSafeRedirectPath` (`security.ts:248`) collapses
absolute/`//`/`/\`/`javascript:` to a safe same-origin path. SVG uploads are explicitly banned
(`security.ts:774`). SAST confirms (sast.md: 6 `dangerouslySetInnerHTML` all sanitized, 0 dangerous
sinks). Evidence: VERIFIED (source) / INFERRED for trigger enforcement (named in code comment + SAST).

**S2 — Fleety LLM security is textbook.** System instructions are kept structurally separate from
user/retrieved content (`prompt.ts buildSystemPrompt`), ALL user + retrieved + material content is
explicitly framed as *untrusted DATA, never commands* (`prompt.ts:21` safety block, `REVIEW_MODE`
material-is-untrusted clause), a canary is injected and leak-gated (`prompt.ts:316`), **no tools are
exposed to the model** (reads are server-side pre-fetch, not model-callable — constrain-don't-instruct),
a pure `detectsCapabilityDenial` **blocks** confabulated denials before they reach the member
(`prompt.ts:201`, ADR-0034), output is re-sanitized through DOMPurify (`sanitizeAIMarkdown`,
`security.ts:1168`), and the material fetcher (`_shared/material-fetch.ts`) is a hardened SSRF gate:
https-only, host allow-list (figma + TF domains), IP-literal + credentialed-URL reject,
`redirect:"error"`, 2 MB + 12 s bounds. Plus US-inference residency pin, DLP scrub, and WAF on the
endpoint (`techfleet-chat/index.ts:6-8`). Evidence: VERIFIED (source).

**(Also solid, not top-2):** blocking dependency-advisories gate with dated/reasoned/expiring waivers
(quill XSS mitigated by DOMPurify, braces build-time-only); `requireAdminRequest` uses
`auth.getClaims` (verify, not decode-only) + `has_role` RPC + audit; `admin-step-up` 2FA; bounded JSON
body parser enforced while streaming (`_shared/http.ts:41-75`); Gumroad path is ledger-only with
trigger-derived membership (no refund fraud); db-schema-present gate (ADR-0036) asserts `rls_enabled`
objects actually exist in prod (fail-closed).

---

## Audit limitations (named)

1. **Biggest limitation — static-only, stale corroboration.** I reviewed source only: I did **not**
   run the app, query live prod RLS/grants, or execute the CI gates. "RLS is applied in prod" and
   "gates are green" rest on reading the gate *code* + the `pentest-report/sast.md`, which is dated
   **2026-04-29 and audited only 49 edge functions / 213 migrations** — the tree now has ~125
   functions / 729 migrations, so SAST coverage is materially stale and I treat its green as
   partial, not current.
2. **Sampling.** I verified auth on ~15 of ~125 edge functions (the sensitive/role-mutating ones) and
   sampled RLS across 729 migrations via targeted greps (`ENABLE ROW LEVEL SECURITY` → 202 across
   111 files; `WITH CHECK (true)` → 56 across 34). A table created without any RLS, or a subtly broken
   `USING` predicate referencing the wrong column, could exist outside my sample.
2b. **No decompilation of `has_role`/RLS predicate bodies.** I confirmed policies/helpers exist and
   are invoked, but did not exhaustively read every policy's `USING` expression for logic flaws.
3. **OneDrive/msys flakiness** (per project memory) forced grep/Read over bash loops; the `index.ts`
   glob returned nothing and directory counts via `wc` failed (cygwin fork error), so function/
   migration counts are approximate (~125 / 729).
