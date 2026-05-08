## Root cause

The user's feedback was rejected because of a real bug in our shared input validators, not anything malicious in his text.

`safeLongTextSchema` and `safeShortTextSchema` (in `src/lib/validators/shared-input.ts`) call `rejectUnsafe`, which calls `hasHeaderInjection` from `src/lib/security.ts`:

```ts
export function hasHeaderInjection(input: string): boolean {
  return /[\r\n]/.test(input) || /%0[aAdD]/i.test(input);
}
```

Any line break (`\n` or `\r\n`) in a body field instantly fails the refine and surfaces "<Field> contains unsafe content". Header-injection checks belong on **header-bound, single-line** values (URLs, names, redirect targets) — not on multi-paragraph body text. That is exactly why:

- His long, multi-paragraph feedback was blocked, but the single word "test" went through.
- He saw the same `"Professional goals contains unsafe content"` error during the application flow — `professional_goals` uses `safeShortTextSchema`, same root cause.
- Removing colons / blank lines between paragraphs eventually let it through (fewer line breaks).

This is a Heuristic #5 (error prevention) and #9 (recognize/diagnose/recover) failure, plus a real false-positive that's silently blocking legitimate user input across the platform.

Earlier we dismissed a related ZodError in triage as "benign" — that was wrong. Re-opening it as part of this fix.

## Plan

### 1. Split header-injection check from XSS/SQL/path checks for body text
File: `src/lib/validators/shared-input.ts`
- Introduce `rejectUnsafeBody(value)` that runs `hasActiveXssPattern`, `hasPathTraversal`, `hasSqlInjectionPattern` but **not** `hasHeaderInjection` (newlines are legal in body text).
- Keep existing `rejectUnsafe` for single-line fields (names, URLs, headers).
- Add a new `safeMultilineTextSchema(label, max)` that uses `rejectUnsafeBody` and allows `\n`/`\r\n`.
- Make `safeLongTextSchema` itself multiline-safe (it's documented as "long text" — paragraphs are expected). Keep `safeShortTextSchema` strict (still rejects newlines, since short = single-line).
- For `professional_goals` (currently `safeShortTextSchema` with 2000 chars but clearly a paragraph field), switch to `safeMultilineTextSchema` in `src/lib/validators/profile.ts`.

### 2. More specific, recoverable error messages
- When a refine fails, surface which class of pattern matched (e.g. "looks like a script tag", "looks like a SQL keyword sequence") instead of the generic "contains unsafe content". Implement via `superRefine` so we can attach a code + hint without leaking regex internals.
- Cap the hint to plain English per Heuristic #9 ("Remove the `<script>` tag and try again").

### 3. Audit other long-form fields
Quick pass to confirm we don't have the same trap on:
- announcement / banner bodies (already use `safeHtmlSchema`, which is fine — DOMPurify path).
- application free-text fields beyond `professional_goals`.
Switch any multi-paragraph field still on short/long-with-header-check to `safeMultilineTextSchema`.

### 4. Triage queue follow-up
- Reopen the ZodError fingerprint we dismissed earlier (root cause is this bug, not a benign RHF rejection). Mark it `manual_fix_deployed` once code ships, with `matching_signal` referencing this fix.
- No suppression-list change needed; revert the `"ZodError"` entry added to `error-reporter.service.ts` so we don't hide future legitimate validator failures.

### 5. BDD scenarios
Insert into `public.bdd_scenarios`:
- `BFB-010` — Feedback with multiple paragraphs submits successfully (UI: success toast, DB: row inserted, Code: schema accepts `\n`).
- `BFB-011` — Feedback containing a literal `<script>` tag is rejected with a specific, actionable error (UI: error names the offending pattern, DB: no row, Code: refine returns specific issue code).
- `BAP-022` — Profile / general-application `professional_goals` accepts paragraph breaks.

### 6. Verification
- Unit tests in `src/test/validators/` covering newline acceptance for body fields and continued rejection of script/SQL/path patterns.
- Manual: paste the user's original feedback text into the feedback dialog and submit; confirm success toast and row in `feedback`.

## Files touched (preview)

- `src/lib/validators/shared-input.ts` — split refines, add `safeMultilineTextSchema`, better messages.
- `src/lib/validators/profile.ts` — `professional_goals` → multiline.
- `src/services/feedback.service.ts` — message field → multiline schema.
- `src/services/error-reporter.service.ts` — remove the `ZodError` suppression added last turn.
- `src/test/validators/shared-input.test.ts` (new or extended) — newline + still-rejects-XSS coverage.
- Migration: BDD rows + reopen the dismissed ZodError row in `agent_fix_queue` with audit reason.

No UI/UX regressions: paste/submit behaviour is identical for valid input; only the false-rejection path changes.
