# Mutation climb batch 3: object-access / ReDoS / sanitize, ratchet break 47 → 50

- Status: accepted
- Date: 2026-10-15
- Deciders: engineering (CI-refactor, mutation-gate climb)

## Context

Third climb step on security.ts's mutation survivors, following
`20261015-mutation-climb-batch2-break-47.md`. The target cluster was L595–700: four functions with
coverage gaps — `isAuthorizedObjectAccess` (object/tenant access control), `safeRegexTest` (ReDoS length
guard), `sanitizeFileName` (header-injection guard), and `sanitizeHtml` (DoS cap + whitespace
normalization + tag/attribute allow-list).

## Decision

1. **Add branch-by-branch tests** (`src/test/lib/security-objaccess-regex-sanitize.test.ts`, 15 cases)
   covering every branch/boundary of the four functions: UUID/admin/owner/tenant-isolation logic
   (including empty-string tenants and admin-does-not-bypass-invalid-UUID), the ReDoS length boundary
   (explicit + default), sanitizeFileName's unsafe-char replacement, and sanitizeHtml's empty-guard,
   normalization, the full tag allow-list, and the `afterSanitizeAttributes` link hook.
2. **Ratchet `thresholds.break` from 47 to 50.**

## Verification (per-function, cache-free line-range Stryker)

- **L601–632** (isAuthorizedObjectAccess + sanitizeFileName + safeRegexTest): 48 mutants, **47 killed,
  1 survivor**.
- **L666–695** (sanitizeHtml killable region): 39 mutants, **34 killed, 5 survivors**.

**Every killable mutant is killed. The 6 survivors are all equivalent, each examined:**

- **L606 `||`→`&&`** (tenant guard) — equivalent: traced every reachable input; when exactly one tenant
  id is falsy, the correct `||` returns false and the `&&` mutant falls through to `a === b`, which is
  also false (a truthy never equals a falsy). Same output in all cases.
- **L667 `dirty.length === 0 → false`** — equivalent: `""` flows to `DOMPurify.sanitize("")` → `""`.
- **L669 `→ true` (always slice)** — equivalent: `slice(0,100_000)` of any ≤100k string is the string.
- **L669 `> → >=` at exactly 100,000** — equivalent: the slice is a no-op at that boundary.
- **L695 `ALLOWED_ATTR` `"target"`/`"rel"` → `""` (×2)** — equivalent because of the
  `afterSanitizeAttributes` hook (security.ts L758-763), which force-sets `target="_blank"` and
  `rel="noopener noreferrer nofollow"` on every surviving `<a>` *after* attribute sanitization. DOMPurify
  would strip them when removed from `ALLOWED_ATTR` (an explicit `ALLOWED_ATTR` replaces the default),
  but the hook re-adds them, and `<a>` is the only allow-listed tag that carries them — so blanking the
  entries cannot change output. The link test was written to assert the hook's *values* (meaningful),
  not attribute presence (which would be vacuous since the hook always adds them).

Whole-file detected score rises from ~51% (batch 2) by batch 3's kills to ~53%. `break` is set to 50, a
safe ratchet (the score cannot regress below batch 2's ~51% since batch 3 only adds kills). The
**authoritative full-file score is CI's Stryker run** on this PR.

## Honest process notes (what went wrong and how it was caught)

1. **Under-verification, caught by judge-arch.** The first verification passed two `--mutate` flags
   (`--mutate 601-632 --mutate 666-695`), but Stryker does **not** combine them — only the last applies,
   so that run verified sanitizeHtml (666-695) only. isAuthorizedObjectAccess, safeRegexTest, and
   sanitizeFileName were unverified until a follow-up per-range run, which surfaced two genuine killable
   gaps (the empty-string-tenant case at L606 and the unsafe-char replacement at L618). Both are now
   closed. Lesson: verify each `mutate` range in its own run (or list them in the config array), never
   via repeated `--mutate` flags.
2. **Incremental cache on test-only changes.** `incremental: true` reuses cached per-mutant verdicts
   keyed on the mutated source; a test-only change does not invalidate them, so the cache must be
   cleared (`rm reports/stryker-incremental.json`) before a verification re-run or it reports stale
   results. (A follow-up should reconsider keeping `incremental` on, since it gives no CI benefit and is
   a local footgun for this climb.)

## Consequences

- The mutation floor is now 50; it ratchets up with each batch and never regresses.
- Four more security functions are fully branch-covered (every killable mutant killed). The climb
  continues toward ~85%; remaining file-wide survivors are heavily regex/string plus the documented
  equivalents.
