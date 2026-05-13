# Full Security Audit — Tech Fleet Network

## Goal
Audit the entire system against OWASP Cheat Sheets without locking out the database, admins, teachers, or members. Every existing read/create/edit/delete capability must work identically before and after the audit.

## Roles in scope
The `app_role` enum has exactly **three** roles: `admin`, `teacher`, `member`. Every permission below is verified for each role plus the `anon` (signed-out) and `service_role` (edge functions) actors.

## Hard guardrails — the no-lockout contract
Apply on **every** migration in this audit:

1. **Permission-preservation invariant.** Before any change, snapshot the role → table → action matrix into `/mnt/documents/security-audit-permissions-baseline.json`. After the change, re-run the same probe; **the diff must be empty for retained capabilities**. Net new restrictions ship only as opt-in additions in a new column or scope, never by removing an existing allow.
2. **Smoke test inside the migration tx.** Each migration ends with `SELECT` and `EXPLAIN`-style probes impersonating `admin`, `teacher`, `member`, `anon`, `service_role`. If any probe regresses an allowed action, `ROLLBACK`.
3. **Additive-first.** New restrictive policies ship alongside existing permissive ones for a 24h shadow window; only flip after live traffic confirms no breakage.
4. **No DROP without paired CREATE OR REPLACE.** Every change reversible in one statement.
5. **Service-role tables stay untouched.** `web_vital_samples`, `fleety_turn_signals`, `agent_fix_queue`, `audit_log`, `email_outbox`, `notification_outbox` keep service-role-only writes — do not add client INSERT policies.
6. **Pre-auth RPCs stay anon-executable.** `peek_rate_limit`, `record_rate_limit_failure`, public-project-opening reads, policy pages, accessibility form, DSAR submit.
7. **No `ALTER ROLE`, no blanket `REVOKE … FROM authenticated`, no edits to `auth/storage/realtime/supabase_functions/vault` schemas.**
8. **UX invariant.** Zero added clicks, prompts, redirects, or latency on user-facing screens.

## Permission baseline matrix
Current scope: **119 RLS-protected tables, 317 policies**, 3 app roles + anon + service_role. The full row-per-table dump lands in `/mnt/documents/security-audit-permissions-baseline.json` during Phase 0. The following grouped matrix captures every capability that must remain intact. **R**=read, **C**=create, **U**=update, **D**=delete, **—**=denied. `(self)` = own row only. `(scope)` = scoped to a relationship (e.g., teacher's own classes, member's own roster row).

### Identity & access
| Domain (tables) | anon | member | teacher | admin | service_role |
|---|---|---|---|---|---|
| `profiles` | — | R(self) U(self, except email) | R(self) U(self) + R(students in own cohorts) | R C U D | R C U D |
| `user_roles` | — | R(self) | R(self) | R C U D (two-step) | R C U D |
| `revoked_sessions` | — | C(self on signout) | C(self) | R C | R C U D |
| `mfa_factors / totp_*` | — | R C U D(self) | R C U D(self) | R(all) D(reset others) | R C U D |
| `rate_limit_*` (peek, record fns) | EXEC | EXEC | EXEC | EXEC | EXEC |
| `cookie_consents`, `dsar_requests`, `deleted_users_ledger` | C(own DSAR via fn) | C(self) R(self) | C(self) R(self) | R(all) U(status) | R C U D |

### Learning & journey
| Domain | anon | member | teacher | admin | service_role |
|---|---|---|---|---|---|
| `learning_paths`, `lessons`, `quizzes` | — | R(published) | R(published, own classes) | R C U D | R C U D |
| `lesson_progress`, `quiz_attempts` | — | R C U(self) | R(students in own cohorts) | R C U D | R C U D |
| `quests`, `quest_steps`, `quest_progress` | — | R C U(self) | R(students in own cohorts) | R C U D | R C U D |
| `certifications` | — | R(self) | R(students in own cohorts) | R C U D | R C U D |

### Teacher-authored content (Classes & Cohorts)
| Domain | anon | member | teacher | admin | service_role |
|---|---|---|---|---|---|
| `classes` | — | R(approved + enrolled) | R C U D(own) — submit→admin approval RPC | R C U D + approve/deny/archive RPCs | R C U D |
| `cohorts` | — | R(enrolled) | R C U D(own classes) | R C U D | R C U D |
| `class_registrations` | — | C(self) R(self) D(self before start) | R(own cohorts) | R C U D | R C U D |

### Projects & recruiting
| Domain | anon | member | teacher | admin | service_role |
|---|---|---|---|---|---|
| `projects` | R(public openings, public columns only) | R(non-complete, public columns) + R(roster-scoped, internal columns via RPC) | R(non-complete, public) | R C U D + internal columns via RPC | R C U D |
| `project_applications` | C(via public form) | R C U(self) D(self before review) | — | R C U D + status transitions | R C U D |
| `project_roster` | — | R(self row only via member RPC) | — | R C U D | R C U D |
| `project_blasts` | — | — | — | R C (append-only) | R C |
| `discord_*`, `notion_*`, `client_intake_*` columns | — | — | — | R U via RPC | R U |

### Communications
| Domain | anon | member | teacher | admin | service_role |
|---|---|---|---|---|---|
| `announcements` | — | R(published, audience-matching) | R(published) + R(own cohorts) | R C U D | R C U D |
| `notifications`, `notification_preferences` | — | R U(self) | R U(self) | R(all) C(via fn) | R C U D |
| `notification_outbox`, `email_outbox`, `web_push_subscriptions` | — | C U(self subscriptions) | C U(self subscriptions) | R(all) | R C U D |
| `feedback_submissions` | C(via fn) | C(self) R(self) | C(self) R(self) | R(all) U(triage) | R C U D |

### Knowledge base & framework reference
| Domain | anon | member | teacher | admin | service_role |
|---|---|---|---|---|---|
| `knowledge_base`, `knowledge_chunks` | — | — | — | R C U D | R C U D |
| `reference_*` (roles, hard_skills, soft_skills, team_functions) | — | R | R | R C U D | R C U D |
| `framework_edges`, MV | — | R | R | R + refresh RPC | R C U D |
| `bdd_scenarios` | — | — | — | R C U D | R C U D |

### Fleety chatbot
| Domain | anon | member | teacher | admin | service_role |
|---|---|---|---|---|---|
| `chat_conversations`, `chat_messages` | — | R C U D(self) | R C U D(self) | R(all) | R C U D |
| `fleety_turn_signals`, `fleety_feedback` | — | R(self) C(via fn) | R(self) C(via fn) | R(all) | R C U D |
| `canned_answers`, `proposed_relationships` | — | — | — | R C U D | R C U D |

### Observability & system health (admin-only)
| Domain | anon | member | teacher | admin | service_role |
|---|---|---|---|---|---|
| `web_vital_samples`, `agent_fix_queue`, `audit_log`, `error_log`, `external_api_events` | — | — | — | R | R C (no UPDATE/DELETE on audit_log) |
| `known_issue_catalog` | — | — | — | R C U D | R C U D |

### Storage buckets
| Bucket | anon | member | teacher | admin | service_role |
|---|---|---|---|---|---|
| `avatars` | R(public URL) | C U D(own folder, <2MB image/*) | C U D(own folder) | R D(any) | R C U D |
| `client_logos` | R(public URL) | R | R | R C U D | R C U D |
| `lesson_media` | — | R(enrolled) | R C U D(own classes) | R C U D | R C U D |
| `meeting_recordings`, `private_attachments` | — | R(scoped) | R(own cohorts) | R C U D | R C U D |
| `transactional_email_assets` | — | — | — | R | R C U D |

### Edge functions (auth gate)
Every edge function continues to require **either** a valid JWT **or** the service-role key. Public functions stay public: `dsar-submit`, `submit-feedback`, public project-opening reads, `record-web-vital`, `peek_rate_limit`, `record_rate_limit_failure`. All others remain JWT-gated.

## OWASP scope (30 of 124 cheat sheets — only ones that match React + Vite + Supabase + Deno)
Authentication · Authorization · Access Control · Session Management · MFA · Forgot Password · Credential Stuffing · Password Storage · OAuth2 · JWT · Secrets Management · Key Management · Cryptographic Storage · Input Validation · Mass Assignment · IDOR · SQL Injection · Query Parameterization · XSS · DOM XSS · CSP · HTTP Headers · HSTS · Clickjacking · CSRF · REST Security · File Upload · SSRF · Logging · Error Handling · User Privacy · LLM Prompt Injection · RAG Security · Vulnerable Dependency Management · NPM Security · Secure Cloud Architecture · Multi-Tenant · DoS · Bot Management · Unvalidated Redirects · TLS · Cookie Theft · XS-Leaks · Prototype Pollution.

## Phases (each gated by the no-lockout contract)
0. **Discovery & baseline** — snapshot every policy/grant/function/bucket/secret/route into the baseline JSON; run `supabase--linter`, security scan, `dependency_scan`, `npm audit`.
1. **AuthN, sessions, MFA** — verify HIBP, idle/absolute timeouts, admin TOTP gate, password-reset race guard, OAuth scopes minimal.
2. **Data access (RLS, IDOR, mass assignment, multi-tenant)** — diff every policy against the baseline matrix above; flag any `using (true)` outside intentional public reads; audit client `update({...})` for column allowlists.
3. **Injection, parameterization, validation** — grep for string-concat SQL, dynamic `format()` without `%L/%I`; confirm Zod on every edge fn entry.
4. **XSS, CSP, headers, clickjacking, redirects** — DOMPurify on announcement WYSIWYG; tighten CSP `script-src`/`connect-src` to exact origins; verify HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy.
5. **Secrets, keys, crypto, transport** — confirm no service-role/Discord/Resend/Notion key reaches client bundle; PII-at-rest rotation healthy; DLP redactor active.
6. **Edge fns, REST, SSRF, file upload** — every fn has CORS allowlist (not `*`), Zod input + output, CircuitBreaker, no user-controlled outbound URL; storage size/mime/path-traversal checks.
7. **Logging, errors, privacy** — no PII/stack to clients; audit_log hash-chain intact; DSAR export complete; deletion scrubs all FKs.
8. **AI, RAG, prompt injection** — Fleety system prompt + KB delimited from user input; audience cache key isolation; output filter for prompt-leak markers.
9. **Dependencies & supply chain** — triage high/critical only; pin via overrides; regenerate SBOM.
10. **DoS, bots, abuse** — rate-limit coverage on auth, password reset, DSAR, project blast, AI; CircuitBreaker thresholds.
11. **Reporting & memory update** — `/mnt/documents/security-audit-report.md`; update `@security-memory`; mark scanner findings fixed/ignored with justifications.

## Deliverables
- `/mnt/documents/security-audit-permissions-baseline.json` (pre-audit role × table × action matrix)
- `/mnt/documents/security-audit-permissions-after.json` (post-audit; diff must show **only** new restrictions, never removed allows for any role above)
- Per-phase migrations (each rolled back if smoke test fails)
- `/mnt/documents/security-audit-report.md` final report
- Updated `@security-memory`

## Rollback plan
Every migration ships with a paired down-migration. If any post-migration smoke probe regresses an allowed capability for **any** of the five actors, immediate `ROLLBACK` and re-plan before re-attempting.
