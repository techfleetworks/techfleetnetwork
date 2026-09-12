# ADR 0041 — Security-advisory backlog is remediated at one owner each, and the classes are held down by blocking gates

<!-- ADR 0040 is taken by set-based-announcement-enqueue (#346); this security-hardening decision is 0041. -->

- Status: Accepted
- Date: 2026-09-12
- Deciders: TechFleet (owner)
- Related: GitHub Security tab (40 open advisories: 35 CodeQL code-scanning, 4 Dependabot, 1 secret-scanning). Owners created/extended: `supabase/functions/_shared/html-to-text.ts` (+ `.test.ts`, `.feature`), `supabase/functions/_shared/url-host.ts`, `src/lib/security.ts#toSafeRedirectPath` / `#fingerprintUserId`, `supabase/functions/_shared/http.ts#errorResponse` (status-aware). Gates: `scripts/ci/check-dependency-advisories.mjs` + `security-advisories.waivers.json` (new), `arch-gate.config.json` rule "Edge functions must not hand-roll HTML stripping/sanitization", CodeQL default-setup as a required check. ADR-0023/0029 (guards must discriminate + be wired), ADR-0035 (fail-closed static gates), ADR-0033 (suppress+report), the frozen-auth lockdown (`06-auth-flow-lockdown.skill.md`). Skills: owasp-secure-coding-bdd, bdd-comprehensive-testing, arch-encode, judge-arch, release-deployment-safety, architectural-decision-records.

## Context and problem statement

The repository's Security tab had **40 open advisories**: 35 CodeQL code-scanning alerts, 4 Dependabot alerts, 1 secret-scanning alert. Two things were wrong at once.

1. **The findings themselves.** Real defects (an open-redirect + reflected-XSS in the auth register flow, a ReDoS in the arch-gate CI script, GitHub-Actions cache-poisoning, error-message/stack leakage from edge responses, `.includes()` host checks) sat alongside a large tail of _duplicated_ hand-rolled HTML-stripping regexes across five edge functions — each independently flagged for `js/incomplete-multi-character-sanitization`, `js/bad-tag-filter`, and `js/double-escaping`. The duplication was the deeper problem: the same bypassable sanitizer, written six times, is six places to get it wrong.

2. **The posture.** `npm audit` was **report-only** by explicit design ("advisories → PR review"), CodeQL ran but was not a required check, and there was no mechanism to say "this advisory has no upstream fix but is mitigated" other than turning the whole check off. So a fixed class could silently regress: nothing structurally stopped the next hand-rolled stripper, the next unvalidated redirect, or the next known-vulnerable dependency from merging.

The problem is a class, not 40 bugs: **security invariants lived in scattered per-call-site code with no single owner and no blocking gate, so they drifted back in.**

## Decision drivers

- **Fix the root, at one owner.** A vulnerability class fixed in six copies is fixed six times and regresses on the seventh. Each class gets exactly one owner that everything routes through (the four-questions "data/behaviour ownership" test).
- **Structurally impossible, not "remembered."** The user's explicit requirement: make recurrence blocked by CI, not by review diligence. Dataflow classes → CodeQL (required); duplication/ownership classes → the mechanical arch-gate; dependency classes → a hard `npm audit` gate.
- **No permanent red, no off-switch.** Some advisories have no upstream fix (quill's HTML-export XSS). A naive hard gate either blocks every PR forever or gets disabled. An expiring, auditable waiver file is the only bypass — the same model as `arch-gate.waivers.json`.
- **Fail-closed** (ADR-0035): can't-check ⇒ red.
- **Respect the auth freeze.** Four findings live in the frozen auth layer; changes there ship only with the full auth regression suite green (`06-auth-flow-lockdown`).
- **Suppress + report, never silently drop** (ADR-0033): a genuine false positive is dismissed _with a written reason_, never hidden.

## Considered options

1. **Dismiss/annotate the alerts, leave the posture report-only.** Rejected: clears the tab without removing the defects or preventing recurrence — the opposite of the requirement.
2. **Fix each finding in place, keep the code shape.** Rejected: leaves the duplicated strippers as six future regressions and doesn't make any class structurally impossible.
3. **Consolidate each class to one owner + flip the gates to blocking, with an expiring waiver file (chosen).** Fix the real defects, delete the duplication into shared owners, and add/turn-on the gates that block the class — CodeQL (dataflow), arch-gate (ownership), `check-dependency-advisories` (deps).
4. **Adopt a third-party SAST/SCA platform (Snyk et al.).** Rejected for now: CodeQL + `npm audit` + the repo's own `scripts/pentest/sast.mjs` already cover these classes; a new vendor is cost/console sprawl without closing a gap these gates leave.

## Decision outcome

**Chosen: Option 3.** Remediation by class, each to one owner, then the class held down by a gate.

### Fixes (one owner per class)

- **HTML → text (17 sanitization + 4 bad-tag-filter + 1 double-escaping alerts).** New owner `supabase/functions/_shared/html-to-text.ts`: `htmlToPlainText` (fixpoint strip — re-applied until stable, so nested `<scr<script>ipt>` cannot survive; `&amp;` decoded LAST so `&amp;lt;` stays literal, never `<`) and `stripActiveContent` (tempered element match, robust to `>` inside attributes) for the markdown-keeping callers. Six hand-rolled strippers (`process-freescout-events`, `send-project-blast`, `send-announcement-email`, `techfleet-chat`, `ingest-workshop-docs`, `fleety-review`) now route through it and were deleted.
- **URL host classification (4 substring alerts).** New owner `supabase/functions/_shared/url-host.ts` (`urlHostnameEndsWith` / `isAirtableAttachmentUrl`) parses the URL and matches the hostname by exact/dotted-suffix instead of `.includes("host.com")`.
- **Open-redirect + reflected XSS (2 alerts, frozen auth).** `src/lib/security.ts#toSafeRedirectPath` reduces an untrusted `?redirect=` to a safe same-origin relative path; `use-register-engine.ts` sanitizes at the source so every downstream use (`window.location.assign`, `emailRedirectTo` concat) is safe.
- **Clear-text storage of a user id (3 alerts, frozen auth).** `src/lib/security.ts#fingerprintUserId` (one-way FNV-1a) replaces the raw user id in the session-start marker (v1→v2) and the OAuth-link toast dedup — equality is all those sites need.
- **Stack-trace / error-message exposure (1 alert).** `errorResponse` (the shared edge owner) is now status-aware; the `freescout-provision-*` handlers send a static client message and keep the real error only in the DB log.
- **ReDoS in `arch-gate.mjs` (1).** The empty-catch regex is rewritten to a linear-time single-alternation body (no overlapping `\s*`).
- **GitHub-Actions cache poisoning (1).** `visual-regression.yml` (which holds `contents: write`) switched to `actions/cache/restore` (read-only) so a PR-context run cannot poison a trusted cache.
- **ReDoS-free shell exec (1).** `generate-smoke-tests.ts` uses `execFileSync` (argv, no shell) instead of string-interpolated `execSync`.
- **Dependencies (4).** `vite` (dev-only, via vitepress) is pinned to the patched `^6.4.3` by a scoped `overrides` (the app's own `vite@7.3.6` was already patched); `quill@2.0.3` has no upstream fix and is waived (mitigated by the DOMPurify allow-list on render + the `sanitize_user_html` DB trigger on write).
- **Secret-scanning (1).** False positive — the literal placeholder `whsec_xx…` in a runbook, replaced with `<paste the whsec_… value from Resend>` so it can never re-match.

### Gates (one per class of enforcement)

- **CodeQL default setup becomes a required check** — enforces the dataflow classes (XSS, open-redirect, stack-trace, substring-sanitization, ReDoS, clear-text-storage) by data flow, which a regex gate cannot.
- **`arch-gate` rule "Edge functions must not hand-roll HTML stripping/sanitization"** (forbids `<[^>]` tag regexes outside `_shared`) — enforces the ownership/duplication class the arch-gate is right for.
- **`check-dependency-advisories.mjs` (blocking, in `Security`)** — fails on ANY `npm audit` advisory not covered by an unexpired entry in `security-advisories.waivers.json`. The waiver file is the only bypass: dated, reasoned, expiring; an expired entry is itself a failure. Complemented by the existing PR `dependency-review` (diff-based, fail-on-high).

## Consequences

**Good**

- Each fixed class has one owner and a gate: a new hand-rolled stripper fails the arch-gate; a new unvalidated redirect / error leak / substring host check fails CodeQL; a new vulnerable dependency fails the audit gate. Recurrence is blocked, not trusted to review.
- The waiver file makes "no upstream fix" honest and time-boxed instead of an off-switch.

**Bad / accepted**

- **CodeQL enforcement depends on branch protection requiring the check** — a repo setting, not a file. It is activated once and documented here; if an admin removes it, the dataflow gate is advisory again. Accepted: it is the platform-native mechanism, and the arch-gate + audit gate remain file-enforced regardless.
- **`fingerprintUserId` is not cryptographic.** It is a collision-resistant-enough equality tag for a client-side marker, not a security boundary; a user id is not a secret. Accepted — it removes the identifier from web storage, which is what the alert is about.
- **The dependency waiver list is hand-maintained** (same reviewed-ratchet cost as every allowlist here). `quill` is the sole entry, expiring 2026-12-31.
- **CodeQL may not recognize the custom sanitizer barriers** (`toSafeRedirectPath`, the fixpoint stripper) on re-scan; any residual is a documented, dismissed-with-reason false positive (ADR-0033), never left ambiguous.

## Confirmation

- `supabase/functions/_shared/html-to-text.test.ts` (11 Deno tests): nested-reconstruction, `>`-in-attribute, no-double-unescape, block-body removal, structural line breaks, event-handler/`javascript:` neutralization.
- `src/test/lib/security-redirect.test.ts`: `toSafeRedirectPath` rejects absolute/protocol-relative/`javascript:`/backslash targets; `fingerprintUserId` deterministic + non-reversible.
- `src/test/features/auth/session-and-reset.service.test.ts` (19/20; frozen-auth regression) updated to the v2/`uidFp` marker contract and green; sign-in service, auth-flow-lockdown contract, and auth-redirect smoke suites green.
- `node scripts/ci/check-dependency-advisories.mjs` → exit 0 (quill waived, vite patched, nothing unwaived); `arch-gate` full scan → PASS; frontend `tsc --noEmit` and Deno `check` on all modified functions → 0.
- `@security` scenarios in `supabase/functions/_shared/html-to-text.feature` and `src/features/auth/auth-redirect.feature`.
