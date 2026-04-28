# WCAG 2.2 Accessibility Audit Harness

This directory contains the Phase 0 baseline scanner for the WCAG 2.2
A / AA / AAA conformance program.

## What it does

[axe-core](https://github.com/dequelabs/axe-core) is run against every
route declared in [`routes.ts`](./routes.ts) using Playwright. axe
catches the **machine-detectable subset of WCAG violations** —
~57% of all criteria, per Deque's published numbers. The remaining
~43% (alt-text quality, focus-order logic, caption accuracy, error-message
helpfulness, etc.) is intentionally **out of scope here** and is tracked
separately in the Phase 2 manual checklist.

## Running the audit

### From GitHub (recommended)

1. Add two repository secrets in
   **Settings → Secrets and variables → Actions**:
   - `TF_ADMIN_EMAIL` — `mdenner@techfleet.org`
   - `TF_ADMIN_PASSWORD` — that account's password
2. Go to **Actions → "WCAG 2.2 Accessibility Audit" → Run workflow**.
3. When the run finishes, download the `a11y-report` artifact from the
   run summary. It contains `a11y-report.json` with full per-route
   findings.

The workflow also runs automatically every Monday at 06:00 UTC as a
drift check.

### Locally

```bash
export TF_ADMIN_EMAIL='mdenner@techfleet.org'
export TF_ADMIN_PASSWORD='…'
npx playwright install --with-deps chromium
npx playwright test e2e/a11y/wcag-audit.e2e.ts --reporter=list
# Report written to a11y-report/a11y-report.json
```

If the credentials aren't set, the spec scans only public routes and
reports the rest as `skipped` so you still get a partial baseline.

## What's in the report

```jsonc
{
  "generatedAt": "…",
  "authedScan": true,
  "totals": {
    "routesTotal": 50,
    "scanned": 38,
    "skipped": 12,           // routes needing real DB ids / email tokens
    "violationsTotal": 217,
    "byImpact":   { "critical": 8, "serious": 41, "moderate": 102, "minor": 66 },
    "byCriterion": { "wcag143": 18, "wcag412": 24, … },
    "byRule":      { "color-contrast": 18, "label": 9, … }
  },
  "results": [ /* per-route violation arrays with element selectors */ ]
}
```

## Workflow phases (overall accessibility program)

| Phase | Status | Output |
|------|--------|--------|
| **0** Baseline scan | ✅ this harness | `a11y-report.json` |
| **1** Code-fixable A/AA/AAA fixes | next | one batch per WCAG guideline (1.3.x → 1.4.x → 2.1.x → …) |
| **2** Content-gated criteria | scheduled | upload-validation enforcement + human checklist |
| **3** Continuous verification | partial (weekly cron) | future: PR-blocking budget gate |

## Updating the route list

When `src/App.tsx` gains or loses a route, edit
[`routes.ts`](./routes.ts) to match. Routes that need real DB ids or
emailed tokens to render meaningfully should be listed with
`skipReason` so the report shows the coverage gap explicitly instead
of silently dropping them.
