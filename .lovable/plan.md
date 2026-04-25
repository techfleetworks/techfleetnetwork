I can do this by upgrading the existing Playwright setup from a Chromium-only smoke suite into a recurring cross-browser QA pipeline.

## What already exists
- Playwright is already installed and runs in GitHub Actions.
- Current browser coverage is Chromium only.
- There is already a weekly WCAG audit workflow.
- Current e2e coverage is small: public navigation, auth screens, profile setup, HMR, and route-level accessibility.

## What I will implement

1. Expand browser coverage
- Add Playwright projects for:
  - Desktop Chrome / Chromium
  - Desktop Firefox
  - Desktop Safari-equivalent WebKit
  - Mobile Chrome
  - Mobile Safari
  - Tablet viewport
- Keep traces, videos, and screenshots on failure so bugs are diagnosable.

2. Add system-wide responsive bug detection
- Create a reusable viewport audit helper that checks each route for:
  - horizontal page overflow
  - clipped dialogs/sheets
  - hidden focusable controls
  - console errors
  - failed network requests
  - basic keyboard navigation regressions
- Run this across the app route list already maintained in `e2e/a11y/routes.ts`.

3. Add critical user-flow tests
- Add cross-browser flows for the highest-risk paths:
  - login and logout
  - admin passkey gate success/failure states where testable
  - Discord verification requiring explicit account selection
  - project openings browsing
  - application entry points
  - chat/resources/events smoke checks
  - admin pages load checks when credentials are available

4. Make it automated and recurring
- Update GitHub Actions so tests run:
  - on every push / pull request for a fast Chromium gate
  - nightly or weekly for the full cross-browser matrix
  - manually from the Actions tab when you want a release check
- Upload Playwright HTML reports, traces, videos, and screenshots as artifacts.

5. Protect runtime stability
- Add a CI check that fails on uncaught `pageerror`, unhandled promise rejection, and key frontend console errors.
- Fail the run on asset/chunk-loading errors like the prior dynamic import failures.

6. Track BDD coverage
- Add BDD scenarios in the database for recurring cross-browser, responsive, and critical-flow regression coverage, matching your project rule that every code change has BDD coverage.

## What you need to do

1. Connect GitHub if it is not already connected.
2. In GitHub Actions secrets, add test credentials if you want authenticated/admin coverage:
   - `TF_ADMIN_EMAIL`
   - `TF_ADMIN_PASSWORD`
3. In GitHub Actions variables, keep the existing app backend variables configured:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`
4. For passkey/WebAuthn-specific real-device behavior, expect some manual validation; CI can cover the fallback/loading/error states, but real platform authenticator behavior is browser/OS dependent.

## Technical details

Files likely to change:
- `playwright.config.ts`
- `.github/workflows/regression.yml`
- new or updated files under `e2e/`
- BDD scenario database records

Proposed automation shape:

```text
Pull request / push
  -> typecheck
  -> build
  -> Vitest
  -> fast Playwright Chromium smoke gate

Nightly or weekly
  -> full Playwright browser matrix
     - Chromium desktop
     - Firefox desktop
     - WebKit desktop
     - Mobile Chrome
     - Mobile Safari
  -> upload reports/traces/videos

Manual release check
  -> same full matrix on demand
```

## Expected outcome

After this, bugs like browser-only layout breakage, mobile overflow, uncaught frontend errors, broken dynamic chunks, failed route loads, and critical flow regressions will be caught automatically and repeatedly instead of relying on one-time manual checks.