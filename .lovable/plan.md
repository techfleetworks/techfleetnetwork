# Full Security Audit — Tech Fleet Network (Read-Only)

## Goal
Audit the entire system against OWASP Cheat Sheets. **No code, schema, RLS, or config changes.** The single deliverable is a written audit report.

## Scope
- Stack: React 18 + Vite 5 + TypeScript + Tailwind, Supabase (Postgres + RLS + Auth + Storage + Realtime), Deno edge functions, Lovable AI Gateway, Discord/Notion/Resend integrations.
- Roles: `admin`, `teacher`, `member`, plus `anon` and `service_role`.
- Surface area: 119 RLS-protected tables, 317 policies, ~120 edge functions, 5 storage buckets, 30+ third-party integrations.

## Hard guardrails (read-only contract)
1. **No migrations, no edge-fn deploys, no code edits, no secret rotations.** Findings only.
2. Use only read tools: `supabase--read_query`, `supabase--linter`, `security--run_security_scan`, `security--get_scan_results`, `code--exec` for filesystem-level grep + `npm audit --json`, `code--fetch_website` for OWASP cheat sheets.
3. Permission baseline (role × table × action) is captured for documentation only — no policy is added, removed, or altered.
4. UX, latency, and admin/member/teacher capabilities remain untouched.

## OWASP cheat sheets in scope and the exact parameters checked for each

For every cheat sheet below: (a) the controls extracted from the OWASP page, (b) the concrete checks run against this codebase, (c) what evidence is captured.

### 1. Authentication
- Controls: credential strength, account-enumeration resistance, brute-force protection, secure password reset, re-auth for sensitive ops.
- Checks: HIBP/pwned-password gate on signup + reset; uniform error messages on login failure; `peek_rate_limit` thresholds and lockout windows; password-reset token TTL; re-auth required before email change / role change / MFA disable.
- Evidence: edge-fn source paths, rate-limit table contents, sample failure messages.

### 2. Authorization & Access Control
- Controls: deny-by-default, least privilege, server-side enforcement, no client-trust.
- Checks: every table has RLS enabled; no policy uses `using (true)` outside intentional public reads; admin checks use `has_role()` not client claims; no `service_role` keys in client bundle.
- Evidence: full `pg_policy` dump, grep of `dangerouslySetInnerHTML`, grep of `service_role` in `src/`.

### 3. Session Management
- Controls: idle timeout, absolute timeout, secure cookie flags, server-side revocation, rotation on privilege change.
- Checks: 30-min idle / 4-hr absolute enforcement; `revoked_sessions` consulted on every request; refresh-token rotation on; session fixation impossible (Supabase-managed JWT).
- Evidence: session config, `revoked_sessions` schema + policies, client refresh path.

### 4. Multi-Factor Authentication
- Controls: phishing-resistant factors, enrollment friction, recovery codes, admin-required MFA.
- Checks: TOTP enrollment for admins enforced after 5-day grace; recovery-code generation + one-time use; MFA-gate edge fn; no SMS fallback.
- Evidence: `mfa_factors` schema, admin gate fn source, BDD scenarios.

### 5. Forgot Password
- Controls: time-limited single-use tokens, no enumeration, rate-limit, no auto-login on reset.
- Checks: token TTL, single-use enforcement, identical response for known/unknown emails, 5-second race-condition guard, `keep_current=true` behavior.
- Evidence: edge-fn source, rate-limit table.

### 6. Credential Stuffing Prevention
- Checks: HIBP integration, device-aware lockout, CAPTCHA fallback (if any), anomaly detection on burst logins.
- Evidence: `peek_rate_limit` config, login fairness rules.

### 7. Password Storage
- Checks: managed by Supabase Auth (bcrypt) — confirm no custom password hashing in app code; confirm no plaintext password fields anywhere.
- Evidence: grep of `password`, `pwd`, `hash` in `src/` and `supabase/functions/`.

### 8. OAuth 2.0 / Social Auth
- Checks: scopes minimal (Google profile+email only); state parameter validated; PKCE on; redirect URIs allowlisted; no token leakage in URL fragments.
- Evidence: Supabase auth provider config, redirect-URI list.

### 9. JWT
- Checks: `alg` pinned (no `none`); short access-token TTL with refresh rotation; audience/issuer validated server-side; no JWT in localStorage exposed to XSS (uses Supabase secure storage).
- Evidence: edge-fn JWT validation pattern.

### 10. Secrets Management
- Checks: every secret in Supabase Vault (`Deno.env`), none in `.env` committed, none in `src/`; rotation logs present; `service_role` never exposed.
- Evidence: `git ls-files` filter, env-var inventory, Vault rotation timestamps.

### 11. Key Management & Cryptographic Storage
- Checks: PII-at-rest encryption (pgsodium), key rotation cadence, KMS-equivalent for symmetric keys, no homemade crypto.
- Evidence: `pgsodium` key list, encrypted columns inventory.

### 12. Input Validation
- Checks: every edge-fn entrypoint runs Zod (or equivalent) on body/query/params; allowlist not denylist; size caps on text fields; UUID/email/URL types narrowed.
- Evidence: per-edge-fn Zod schema audit.

### 13. Mass Assignment
- Checks: client `update({...})` calls use explicit column allowlists; no `select * from` paths returning sensitive cols (PII columns flagged); `profiles.email` immutability trigger present.
- Evidence: grep of `.update(` and `.upsert(` in `src/`.

### 14. IDOR (Insecure Direct Object Reference)
- Checks: every RLS policy filters by `auth.uid()` or `has_role()`; no edge fn trusts `userId` from request body; UUID v4 used (not sequential ids).
- Evidence: policy WHERE-clause review, edge-fn body-param audit.

### 15. SQL Injection / Query Parameterization
- Checks: all RPCs use parameterized args (`$1`, `_param`); no `format(... %s ...)` without `%L`/`%I`; PostgREST filters from client never built via string concat.
- Evidence: grep of `format(` and `EXECUTE` in `pg_proc.prosrc`.

### 16. XSS (Reflected, Stored, DOM)
- Checks: DOMPurify on announcement/lesson WYSIWYG render paths; React escaping intact; no `dangerouslySetInnerHTML` without sanitizer; URL-render fields validated.
- Evidence: grep of `dangerouslySetInnerHTML`, sanitizer wrapper inventory.

### 17. Content Security Policy
- Checks: header present and not `unsafe-inline`/`unsafe-eval` for scripts (Vite hash where possible); `connect-src` allowlist names exact origins (Supabase, Discord, Notion, Resend, AI Gateway); `frame-ancestors 'none'`.
- Evidence: deployed response headers.

### 18. HTTP Security Headers
- Checks: `Strict-Transport-Security` ≥ 1y + preload; `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy` denies camera/mic/geo unless used.
- Evidence: live header dump per route family.

### 19. HSTS
- Checks: HSTS on all custom domains; preload status verified.
- Evidence: `curl -I` of `techfleet.network`, `www.techfleet.network`.

### 20. Clickjacking
- Checks: `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'`; no third-party iframe embedding of app.
- Evidence: response headers.

### 21. CSRF
- Checks: state-changing edge fns require Supabase JWT (bearer, not cookie) → CSRF surface limited; any cookie-auth path has SameSite=Lax+ and CSRF token.
- Evidence: edge-fn auth gate review.

### 22. REST Security
- Checks: no verbs leak (`OPTIONS` minimal); CORS allowlist (no `*` on auth'd routes); error envelopes don't leak stack/SQL; pagination bounded.
- Evidence: per-edge-fn CORS header audit.

### 23. SSRF
- Checks: no edge fn fetches a user-controlled URL; integrations (Discord, Notion, Resend, AI Gateway) use allowlisted hostnames; outbound to private CIDRs blocked.
- Evidence: grep `fetch(` in `supabase/functions/`.

### 24. File Upload
- Checks: storage RLS scopes uploads to user folder; size cap (avatars <2MB); MIME allowlist; path-traversal blocked; antivirus or content-type sniff (where applicable).
- Evidence: storage policies, upload util source.

### 25. Logging & Monitoring
- Checks: `audit_log` hash-chain intact (DELETE-blocked trigger); no PII in logs (DLP redactor confirmed); Lane-2 self-heal events present; admin-visible Triage queue.
- Evidence: `audit_log` row-count + chain verify, sample log payloads.

### 26. Error Handling
- Checks: production builds strip stack traces from client responses; generic 500 to user, detailed to log; no SQL errors surfaced.
- Evidence: edge-fn catch blocks, client error boundary copy.

### 27. User Privacy
- Checks: GA4/Clarity gated on consent; GPC honored; DSAR pipeline reaches all FK chains; deletion ledger maintained; data-retention windows documented (7d/90d/forever per type).
- Evidence: `cookie_consents`, `dsar_requests`, retention SQL.

### 28. LLM Prompt Injection
- Checks: Fleety system prompt + KB delimited from user input; user content never concatenated into instruction blocks; output filter for prompt-leak markers; tool-use scoped.
- Evidence: Fleety pipeline source (L1–L6).

### 29. RAG Security
- Checks: KB rows tagged with audience; cache key includes `audience+kb_version`; per-user cache isolation; no cross-tenant chunk bleed.
- Evidence: `knowledge_base` schema, cache-key code.

### 30. Vulnerable & Outdated Components
- Checks: `npm audit --json` high+critical; Deno import-map versions pinned; no abandoned packages; SBOM regenerable.
- Evidence: `npm audit` output, `package.json` pin strategy.

### 31. NPM Security
- Checks: lockfile committed; no `postinstall` scripts from untrusted packages; no typosquat candidates.
- Evidence: `package-lock.json` review.

### 32. Secure Cloud Architecture
- Checks: backend/frontend separation honored; no direct DB exposure to internet; service-role key server-only; least-privilege Postgres roles.
- Evidence: project topology summary.

### 33. Multi-Tenant (per-role)
- Checks: every tenant-scoping policy uses `auth.uid()` or `has_role()`; no cross-role data bleed in RPCs; admin reads logged.
- Evidence: cross-role probe matrix.

### 34. Denial of Service
- Checks: rate limits on auth, password reset, DSAR, project-blast, Fleety, edge fns; CircuitBreaker thresholds; AI cost guard 30d projection.
- Evidence: rate-limit table, breaker config.

### 35. Bot Management
- Checks: signup/contact forms have abuse signals; Discord bot endpoints validate signatures; no open scraping endpoints for member data.
- Evidence: bot-signature verification source.

### 36. Unvalidated Redirects
- Checks: `?next=` / `?redirect=` params allowlisted to in-app paths; no open redirect on auth callback.
- Evidence: redirect-utility source.

### 37. Transport Layer Security
- Checks: TLS 1.2+ enforced; no mixed content; cert chain healthy on all custom domains.
- Evidence: SSL Labs grade or equivalent.

### 38. Cookie Theft Mitigation
- Checks: cookies marked `Secure`, `HttpOnly` (where set), `SameSite=Lax`+; auth tokens not in `document.cookie`-readable storage where avoidable.
- Evidence: cookie inventory.

### 39. XS-Leaks
- Checks: `Cross-Origin-Opener-Policy: same-origin`; `Cross-Origin-Embedder-Policy` where compatible; no timing oracles in auth responses.
- Evidence: response headers.

### 40. Prototype Pollution
- Checks: no use of `lodash.merge` < safe; no recursive merge of untrusted JSON into JS objects; framework deps not on the published-vuln list.
- Evidence: dependency grep.

## Audit phases (all read-only)
0. **Discovery** — capture baseline: `pg_policy`, `pg_proc`, `pg_class`, storage policies, edge-fn list, env-var names, deployed headers.
1. Cheat-sheets 1–11 (identity, sessions, MFA, secrets/crypto).
2. Cheat-sheets 12–16 (input/IDOR/mass assign/SQLi/XSS).
3. Cheat-sheets 17–22 (CSP/headers/HSTS/clickjacking/CSRF/REST).
4. Cheat-sheets 23–26 (SSRF/upload/logging/errors).
5. Cheat-sheets 27–29 (privacy/LLM/RAG).
6. Cheat-sheets 30–32 (deps/npm/cloud).
7. Cheat-sheets 33–40 (multi-tenant/DoS/bots/redirects/TLS/cookies/XS-leaks/prototype).
8. Report assembly.

## Findings document — exact contents

Output: `/mnt/documents/security-audit-report.md` plus machine-readable `/mnt/documents/security-audit-findings.json`.

### Document structure
1. **Executive summary** — counts by severity (critical/high/medium/low/info), top 10 risks, residual-risk statement.
2. **Scope and method** — stack, roles, tools used, time window, exclusions.
3. **Permission baseline matrix** — full role × table × action table (documentation only; not enforced).
4. **Findings register** — one entry per finding with the schema below.
5. **Per-cheat-sheet appendix** — for each of the 40 cheat sheets: controls checked, pass/partial/fail verdict, evidence links, gap list.
6. **Compliance crosswalk** — SOC 2 CC, ISO 27001 Annex A, HIPAA §164.312 mapping per finding.
7. **Recommended remediation backlog** — prioritized, sized (S/M/L), dependency-aware, with explicit "no-lockout" notes.
8. **Accepted-risks register** — anything intentionally left as-is, with owner + review date.
9. **Appendix A** — raw evidence dumps (linter output, `npm audit`, header dumps, policy dump).
10. **Appendix B** — methodology (queries run, grep patterns, fetch list).

### Per-finding schema
```
- id:               SA-NNNN
- title:            Short business-impact title
- cheat_sheet:      e.g. "Authorization & Access Control"
- severity:         critical | high | medium | low | info
- likelihood:       high | medium | low
- impact:           confidentiality | integrity | availability (one or more)
- affected_assets:  table / fn / route / bucket / dependency
- roles_at_risk:    anon | member | teacher | admin | service_role
- description:      ≤40 words, harm first
- evidence:         file:line, query result, header dump, screenshot path
- reproduction:     exact steps or query
- recommendation:   concrete fix, no-lockout caveat
- effort:           S | M | L
- compliance_refs:  SOC2 / ISO / HIPAA tags
- status:           open | accepted-risk | duplicate | informational
```

## Deliverables
- `/mnt/documents/security-audit-report.md`
- `/mnt/documents/security-audit-findings.json`
- `/mnt/documents/security-audit-evidence/` (raw dumps: policy export, headers, npm-audit, linter output)

## Explicitly out of scope for this run
- No SQL migrations.
- No edge-function code changes.
- No client code changes.
- No secret rotation.
- No `@security-memory` updates (those happen only after a follow-up remediation pass you approve separately).
