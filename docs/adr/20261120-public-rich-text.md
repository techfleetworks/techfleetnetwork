# 20261120 — Public class pages render teacher rich-text as sanitized HTML (reverses "plain text only")

- Status: Accepted
- Date: 2026-11-20
- Deciders: product owner (mdenner), engineering
- Ticket: public-access B10 follow-up (logged-out detail-page review, 2026-11-20)
- Supersedes (in part): 20261118-public-classes-pages — the "Free text is rendered
  as plain text, never raw HTML" clause of its Decision.
- Related: 20261119-public-classes-visibility, 20261120-public-class-detail (outcomes).

## Context and problem statement

`PublicClassDetailPage` stripped ALL HTML from teacher-authored fields
(`summary`, `description`, `outcomes`, `curriculum`) via `stripHtml`, to avoid
injecting raw markup (the original B10 decision). But those fields are authored as
rich text in `ClassFormPage` and stored as HTML:

- `summary` = `<h2>Overview</h2><p>…</p><h2>Project</h2><p>…</p>`
- `curriculum` = `<h3>Week 1 …</h3><ol><li>…</li></ol>…`
- `outcomes` = `<ol><li>…</li></ol>`

Stripping the tags flattened that structure into one run-on blob: headings jammed
onto the following text ("OverviewResearch…Project…"), the curriculum became a wall
of text, and the outcomes list lost its list-ness. The authenticated
`ClassDetailPage` already renders the same fields as **sanitized** HTML (DOMPurify
via `sanitizeHtml`) and reads correctly; the public page did not.

Two forces also argued for structured HTML: readability for humans, and
**scannability for crawlers** — semantic headings and lists give search engines a
real document outline, where a flattened `<p>` blob gives none.

## Decision

- **Render `summary`/`description`/`outcomes`/`curriculum` as sanitized HTML**, via
  the existing `sanitizeHtml` (DOMPurify) — the same control the authenticated page
  uses — instead of `stripHtml`. A small `Prose` component renders the sanitized
  string with the typography styles. `stripHtml(summary)` is kept ONLY to derive the
  plain-text SEO `<meta>` description.
- **`sanitizeHtml` is the security control.** Its allowlist is `p/br/strong/b/em/i/
  u/s/a/ul/ol/li/h2/h3/blockquote` with attrs `href/target/rel`, `ALLOW_UNKNOWN_
  PROTOCOLS:false`, and an http(s)/mailto/relative/anchor URI regexp. Scripts, event
  handlers, iframes, `svg`, `img`, forms, and `javascript:`/`data:` URLs are
  stripped. So "render HTML" here is NOT "render raw teacher markup".
- **This reverses the B10 "plain text only, never raw HTML" clause** — deliberately,
  because the replacement is not raw HTML but a vetted sanitized subset already in
  production on the authenticated page.
- List/scalar fields are unchanged: `skills` → pills (Badge), `prerequisites` → a
  joined paragraph (it is stored as sentence fragments), `deliverables` → a bullet
  list. Those are `string[]`/scalar, not HTML.

## Pattern-decision record (pattern-selector)

- **Problem / forces:** preserve authored structure (headings/lists) and crawler
  scannability, without opening an XSS hole; stay consistent with the authed page.
- **Decision:** reuse the existing **sanitizer boundary** (`sanitizeHtml`) and a
  **Humble View** (`Prose`) that only renders already-sanitized output.
- **Candidates considered:**
  - (a) Sanitized HTML via the shared `sanitizeHtml` — chosen. One security control,
    consistent with the authed page, preserves structure, more scannable.
  - (b) Keep `stripHtml` and hand-reformat the flattened text — rejected: lossy,
    breaks again on every teacher edit, and kills list/heading semantics.
  - (c) A bespoke markdown/AST renderer — rejected: over-engineered; a proven
    HTML sanitizer already exists in the repo.
- **Failure / rot prevented:** flattened unreadable content; divergence from the
  authed page; and (the risk this introduces) stored-XSS via teacher HTML — closed
  by routing every rich-text field through `sanitizeHtml`.
- **Security trade-off:** adds a `dangerouslySetInnerHTML` sink, mitigated by the
  DOMPurify allowlist. No new data surface. Verified by a `@security` scenario (a
  `<script>`/`onerror` payload is stripped, not executed) and the DOMPurify config.
- **Verify correct application:** vitest — authored headings/lists render as HTML
  (not a flat blob); a `<script>`/`onerror` payload is sanitized away; skills render
  as pills; prerequisites render as one paragraph.
- **Real guarantee:** the page renders the sanitizer's output. It does not prove
  `sanitizeHtml`'s allowlist is itself complete (that is the sanitizer's own tests),
  nor that every browser renders identical typography.

## Consequences

- Changed: `src/pages/PublicClassDetailPage.tsx` (Prose + sanitized rich-text;
  skills pills; prerequisites paragraph; H1-scale section headings; instructor h4;
  no "Schedule" header; more lg column gap; How-to-join numbered steps),
  `src/pages/public-classes.feature` (the no-raw-HTML scenario becomes a
  sanitized-HTML scenario, now `@status:proven`), tests.
- The authenticated `ClassDetailPage` is unchanged (already sanitized).
- Deploys via Cloudflare Pages on merge (frontend only; no gateway change).
- Follow-up (separate PR): a "no open cohort" newsletter CTA (Email Octopus
  double-opt-in) on the schedule card.
