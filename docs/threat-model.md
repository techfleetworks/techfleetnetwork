# Tech Fleet Network — STRIDE Threat Model

**Last updated:** 2026-04-18
**Owner:** Security & Platform Engineering
**Scope:** SPA + Supabase Edge Functions + Postgres (RLS)

---

## System overview

```
┌──────────────┐  HTTPS   ┌──────────────────┐   PostgREST   ┌──────────────┐
│  Browser SPA │ ───────▶ │  Supabase Edge   │ ────────────▶ │  Postgres +  │
│  (React/PWA) │ ◀─────── │  Functions (Deno)│ ◀──────────── │     RLS      │
└──────┬───────┘   JWT    └────────┬─────────┘   Service Key └──────────────┘
       │                           │
       │  WSS (Realtime)           │
       └───────────────────────────┘
                                   │
                  ┌────────────────┼────────────────┐
                  ▼                ▼                ▼
            Lovable AI       Firecrawl         Discord/Email
            Gateway          (web search)      (notifications)
```

## Trust boundaries

1. **Browser ↔ Edge Functions** — JWT or session token; rate-limited per user.
2. **Edge Functions ↔ Postgres** — service role; bypasses RLS, must enforce in code.
3. **Edge Functions ↔ Third parties** — outbound only to allow-listed hosts.
4. **Browser ↔ Storage** — direct uploads gated by storage RLS + (now) `validate-upload` edge function.

---

## STRIDE per asset

### Asset 1 — User authentication

| Threat (STRIDE)    | Vector                                            | Mitigation |
|--------------------|---------------------------------------------------|------------|
| **S**poofing       | Stolen password / session hijack                  | MFA TOTP + WebAuthn passkeys for admins; HIBP leaked-password check; SameSite cookies; rate-limited login (`record_failed_login` → auto-revoke). |
| **T**ampering      | JWT modification                                  | RS256 signing by Supabase; signature verified on every edge fn call. |
| **R**epudiation    | "I didn't change my role"                         | `audit_log` triggers on `user_roles`, `profiles`, `revoked_sessions`; immutable timestamps. |
| **I**nfo disclosure| Leaked tokens via XSS                             | DOMPurify + deepSanitize + CSP `script-src` minus `'unsafe-inline'`; `Cross-Origin-Opener-Policy: same-origin`. |
| **D**oS            | Credential stuffing                               | `check_rate_limit()` (5 attempts/15min → 30min block) + auto session revocation. |
| **E**oP            | Privilege escalation via mass assignment          | Service-layer field allow-list; `prevent_email_change()` trigger; roles in separate `user_roles` table; `has_role()` SECURITY DEFINER. |

### Asset 2 — User PII (profiles, applications)

| STRIDE | Mitigation |
|---|---|
| Spoofing | `auth.uid()` checks in every RLS policy; admin reads logged via `log_pii_access()`. |
| Tampering | RLS UPDATE policies scoped to row owner; `prevent_email_change()` trigger. |
| Repudiation | `audit_general_application`, `audit_project_application`, `audit_role_changes` triggers. |
| Info disclosure | RLS deny-by-default; storage RLS scoped to `userId/` folder; `maskEmail`/`maskPii` helpers. |
| DoS | Pagination defaults; `cleanup_rate_limits()` cron. |
| EoP | Two-tier RBAC; admin actions re-verified per JWT session via passkey gate. |

### Asset 3 — Storage (avatars, logos, announcement media)

| STRIDE | Mitigation |
|---|---|
| Spoofing | Authenticated uploads only; storage RLS pins prefix to `auth.uid()`. |
| Tampering | New `validate-upload` edge fn re-encodes images server-side; magic-byte verification; SVG rejected. |
| Repudiation | Upload events flow through edge fn → `audit_log`. |
| Info disclosure | Listing forbidden via storage SELECT policy; only direct-URL reads. |
| DoS | 2 MB cap; max-dimensions enforced server-side. |
| EoP | No path-traversal: `sanitizeFileName` + extension allow-list; bucket policies prevent cross-user writes. |

### Asset 4 — Fleety AI assistant

| LLM Top-10 | Mitigation |
|---|---|
| LLM01 Prompt injection | Role-confusion blocklist (`PROMPT_INJECTION_PATTERNS`); user input never concatenated into system prompt; canary token in system prompt + output redaction. |
| LLM02 Sensitive info disclosure | PII regex redaction in `sanitizeAIOutput`; KB sanitized before indexing. |
| LLM05 Insecure output | `<script>`, `javascript:`, `<iframe>`, `on*=` stripped from streamed output; rendered as Markdown via React (no `dangerouslySetInnerHTML`). |
| LLM06 Excessive agency | NO tool execution; LLM produces text only; `LLM_TOOLS` array empty. |
| LLM07 System prompt leakage | Canary phrase replaced with `[REDACTED]`. |
| LLM08 Vector poisoning | KB ingestion via admin-only edge fn; sources reviewed before write. |
| LLM10 Unbounded consumption | `max_tokens: 4096`; `MAX_MESSAGES: 50`; `MAX_MESSAGE_LENGTH: 20_000`; per-user rate limit. |

### Asset 5 — Edge functions / outbound calls

| STRIDE | Mitigation |
|---|---|
| Spoofing | JWT or service-role validated in every function. |
| Tampering | TLS 1.2+ for all egress; HSTS preload. |
| Repudiation | `write_audit_log` calls on sensitive operations. |
| Info disclosure | `safeErrorMessage` strips internals from responses. |
| DoS | Per-user rate-limit; AbortController on outbound HTTP; circuit breaker. |
| EoP / SSRF | `isSafeExternalUrl` blocks RFC1918 + cloud metadata IPs; egress hosts hardcoded. |

---

## Residual risks (accepted)

| Risk | Reason accepted | Compensating control |
|---|---|---|
| `style-src 'unsafe-inline'` | Tailwind / shadcn need it; nonce migration is infeasible without rewriting design system. | All user HTML stripped of `style`, `class`, `id` attrs at write + read time; CSS-injection vector closed. |
| Cookie-token theft via XSS | SPA stores tokens in localStorage. | Multi-layer XSS defense (CSP `script-src` no inline, DOMPurify, deepSanitize, server-side HTML sanitizer trigger). |
| Session ID in URL during password recovery | Required by Supabase recovery flow. | Single-use token; 5s race-condition guard; HSTS prevents leak via referrer. |
