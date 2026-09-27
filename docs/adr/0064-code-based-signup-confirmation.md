# ADR 0064 — Code-based signup email confirmation (prefetch-proof), replacing the single-use verify link

- Status: Proposed
- Date: 2026-09-26
- Deciders: Morgan Denner
- Epic: Auth / Sign-up
- Related:
  - `supabase/functions/auth-email-hook/index.ts` (`buildConfirmationUrl`) and
    `supabase/functions/_shared/email-templates/signup.tsx` — where the confirmation link/code is built and rendered.
  - `src/pages/ConfirmRecoveryLinkPage.tsx` + `src/features/auth/engine/use-reset-password-engine.ts` — the
    **AUTH-RESET-PREFETCH-001** pattern this mirrors (inert landing; verify only on a human gesture).
  - `src/features/auth/services/sign-up.service.ts` (`resendSignupConfirmation`),
    `src/features/auth/ports/session.port.ts` (`verifyRecoveryOtp`) — the seams the new code path mirrors.
  - `src/features/auth/services/resend-signup-confirmation.flow.ts` — the single owner of the resend
    orchestration (rate-limit + captcha-gated send + delivery-unverified telemetry) shared by the
    register success surface and `/auth/confirm`, so the workflow is not duplicated across engines.
  - New: route `/auth/confirm` → `ConfirmSignupPage` + `use-confirm-signup-engine` + `confirm-signup.service`.
  - Frozen-auth lockdown: `CLAUDE.md` §"Auth is frozen"; enforced by
    `src/features/auth/testing/contract/auth-flow-lockdown.contract.test.ts` + the auth smoke suite.
  - Skills: `owasp-secure-coding-bdd`, `bdd-comprehensive-testing`, `release-deployment-safety`,
    `sre-operational-readiness`, `universal-accessibility-wcag`.

## Context

New accounts could not confirm their email. A user (`mdenner@swerl.net`, a Zoho mailbox) clicked the
confirmation link **immediately** and still got _"Email link is invalid or has expired. Please try again."_
That error is not real expiry — it is a **single-use token that was already spent before the human clicked.**

The auth email links are built by the `auth-email-hook` edge function (GoTrue's native Send Email Hook).
Its `buildConfirmationUrl` has two branches:

- `recovery` (password reset) → an **inert app landing** `${APP_ORIGIN}/reset-password/confirm?token_hash=…&type=recovery`.
  A link scanner may GET it harmlessly; `verifyOtp` runs only when a human clicks through
  (**AUTH-RESET-PREFETCH-001**).
- **everything else** (`signup`, `invite`, `magiclink`, `email_change`) → the standard GoTrue
  `/auth/v1/verify?token=<hash>&type=…` GET, which **validates and consumes the single-use token on the
  first GET**.

So the signup email button points at a single-use GET. Email security scanners, webmail/link previews, and
antivirus/web-protection routinely issue that GET before (or independently of) the human — burning the token.
The subsequent human click hits an already-consumed token; GoTrue redirects to the app with
`error_code=otp_expired&error_description=Email link is invalid or has expired`, which
`src/components/AuthRedirectHandler.tsx` reads off the URL and renders. Proven end-to-end in code; the
recovery flow is immune only because it was specifically hardened, and signup never got the same treatment.

A second, related defect: `src/integrations/supabase/client.ts` sets `detectSessionInUrl: false` (the AUTH-RESET
fix), so even a _successful_ verify redirect to `/` would not establish a session — signup confirmation could
not log the user in even on the happy path, because nothing on `/` consumes the returned tokens.

Scope: this ADR covers confirmation of GoTrue auth emails routed through `auth-email-hook`. **Signup is fixed
fully and first** (the reported, highest-volume path). The low-/no-traffic `invite` and `magiclink` types are
routed to the same inert handler so they cannot regress into the vulnerable branch. `email_change` is
**explicitly deferred** to a tracked follow-up: its two-sided double-confirm semantics
(`email_change_current` / `email_change_new`, plus the dashboard `secure_email_change` setting) need owner
verification before rerouting, and a blind reroute risks regressing a working flow — the frozen-auth directive
is "smallest change that fully solves it," not a risky sweep.

## Decision drivers

- **Kill the failure class, not a symptom.** "Clicked a fresh confirmation → expired" must become structurally
  impossible. The failing dial is _single-use-on-first-touch_, **not** expiry time — lengthening expiry does
  nothing (a scanner burns the token within seconds), and the only dial that would help (a reusable, multi-click
  link) lives inside GoTrue and is a security downgrade (a forwarded/logged link stays live longer).
- **Device-agnostic.** A code the human types is immune to link prefetch entirely, and works even when the email
  is opened on a different device/browser than sign-up (no PKCE `code_verifier` dependency).
- **Reuse, don't invent.** Mirror the in-repo `AUTH-RESET-PREFETCH-001` pattern, and lean on GoTrue's
  battle-tested OTP (minting, hashing, expiry, rate-limiting) rather than hand-rolling auth crypto
  (`decisions.md` §8: security invariants have one owner).
- **Respect the frozen-auth lockdown.** No change to `src/integrations/supabase/client.ts` or the `main.tsx`
  boot block; exactly one Supabase client; the auth regression suite must pass.
- **Never lock anyone out.** Existing confirmed users, already-pending signups, and Google OAuth must keep
  working straight through the rollout.

## Decision

Adopt **code-based confirmation as the primary path, with an inert confirm landing for the button/link**, for
all GoTrue auth emails routed through the hook.

1. **Email (`auth-email-hook` + `signup.tsx`).** Render the 6-digit GoTrue OTP — `email_data.token`, already
   present in the payload and currently unused by the signup template — as the primary instruction, alongside a
   **"Confirm my email"** button. Generalize `buildConfirmationUrl` so `signup` / `invite` / `magiclink` return an
   **inert app landing** `${APP_ORIGIN}/auth/confirm?token_hash=<hash>&type=<type>` (exactly as `recovery`
   already does), instead of the `/auth/v1/verify` GET. (`email_change` stays on the verify GET for now —
   deferred, see Scope.) The URL is built from the `APP_ORIGIN` allow-list, never from unvalidated input.

2. **Inert route `/auth/confirm`** (`ConfirmSignupPage` + `use-confirm-signup-engine`). Does **nothing on load**
   — a scanner GET is harmless. It presents (a) a 6-digit code input and (b) the "Confirm my email" button that
   consumes the `token_hash` from the URL. Verification runs only on the human gesture, via GoTrue:
   - code path: `verifyOtp({ email, token, type: "signup" })`
   - link path: `verifyOtp({ token_hash, type: "signup" })`

   `verifyOtp` returns a real session on success → route to `/dashboard`. This mirrors `ConfirmRecoveryLinkPage`
   - `use-reset-password-engine`'s defer-until-gesture, and fixes the `detectSessionInUrl:false` secondary gap
     (the session is set by the SDK call, not parsed from the URL).

3. **Service / port.** A new `confirm-signup.service.ts` is the single owner of the signup `verifyOtp` calls
   (mirroring `verifyRecoveryOtp`), consumed by the engine. Reuse the existing captcha-gated
   `resendSignupConfirmation` for "send me a new code," plus the existing cron safety-net
   `resend-signup-confirmations` for unconfirmed accounts.

4. **Register success UX.** After `signUp` returns `verification_email_sent`, take the user to the confirm
   screen (email pre-filled) so they can type the code immediately, instead of a dead "check your email" page.

5. **Friendly, non-dead-end outcomes.** Already-confirmed → route to `/login` with "you're all set, please sign
   in" (not an error). Wrong / expired code → inline message + a "send me a new code" action. No raw
   `otp_expired` string ever shown.

## Security model (OWASP pass — captured as `@security` scenarios)

- **Brute-forcing the 6-digit code:** GoTrue codes are cryptographically random, hashed at rest, single-use, and
  expiring; `verifyOtp` is server-rate-limited; the app's existing per-IP/per-email throttle (`peek_rate_limit`)
  and Turnstile-on-throttle (`createAuthThrottleCaptchaError`) add defense-in-depth. This is the control that
  makes guessing infeasible — **not** code uniqueness.
- **"Two users, same code":** codes are **scoped to the requesting email** — a code is only ever checked against
  the email that requested it, so two users sharing six digits has **zero** security impact (keycard model).
  Global-unique codes are explicitly rejected (below).
- **Account enumeration:** confirm/resend return generic messages and never reveal whether an email exists
  (mirrors existing `resendSignupConfirmation`).
- **Open redirect:** links and post-confirm redirects are built from the `APP_ORIGIN` allow-list; any client-side
  redirect target goes through `toSafeRedirectPath` (`decisions.md` §8).
- **Replay:** single-use — the token/code is consumed on success.
- **Secret hygiene:** the code/`token`/`token_hash` is never logged (log email + outcome only, as
  `sign-up.service` already does); no user id stored in clear web storage.
- **Email-bomb / resend abuse:** resend stays rate-limited and Turnstile-gated (`signup_confirmation_resend`).
- **Lockout safety check (mandatory, `owasp-secure-coding-bdd`):** existing confirmed users, already-pending
  signups (old `/auth/v1/verify` links **and** a fresh code both work during rollout), and Google OAuth are
  unaffected. No change to `client.ts` or the session-timeout owner.

## Alternatives considered

- **Lengthen the link expiry (e.g. 30 min).** Rejected: the failing dial is single-use-on-touch, not time; a
  scanner burns the token within seconds regardless of expiry. The only dial that would help — a reusable,
  multi-click link — is GoTrue-internal and a security downgrade.
- **Inert landing + `token_hash` only, no typed code.** This alone already defeats prefetch and cross-device
  (token_hash is not PKCE). Rejected as the _sole_ fix: the typed code is the belt-and-suspenders that also
  covers a link that is mangled/blocked/stripped by a mail gateway, and was the owner's explicit ask. We do
  **both**; the code is primary.
- **Globally unique codes across all users.** Rejected: the 6-digit space collides at our scale, "code already
  taken" leaks information, and it adds complexity for **zero** security benefit — per-email scoping +
  rate-limit/expiry/single-use is the real control.
- **Hand-roll our own OTP (generate/store/verify codes ourselves).** Rejected: reinventing an auth security
  invariant GoTrue already owns (mint/hash/expire/rate-limit), against `decisions.md` §8 and the frozen-auth
  lockdown.
- **Consume the token on the landing page's load (`useEffect`).** Rejected — that _is_ the current bug: a GET
  (scanner) consumes it. Verification must defer to a human gesture (AUTH-RESET-PREFETCH-001).

## Consequences

**Good**

- The prefetch / double-GET / cross-device signup-confirmation failure is eliminated; a freshly clicked or typed
  confirmation cannot report "expired."
- Device-agnostic; reuses a proven in-repo pattern and proven OTP infrastructure.
- Confirmation now logs the user in on success (closes the `detectSessionInUrl:false` secondary gap for signup).
- `invite` / `magiclink` are moved to the safe handler in the same change and cannot regress (`email_change`
  tracked as an explicit follow-up).

**Trade-offs / honest limits**

- One extra human tap ("Confirm my email") on the inert landing — the price of prefetch-immunity, identical to
  the reset flow.
- A small new screen + input to maintain.
- Failures truly outside the flow — email filed as spam, a deleted email, a GoTrue/Supabase outage — still
  happen; they are handled by resend + the cron safety-net + clear messaging, **not** a false "impossible"
  claim. "Un-hackable" is not claimed as an absolute: every _known_ attack path for this flow is closed and
  monitored (`sre-operational-readiness`: confirmation-success-rate signal + alert).

**Owner (dashboard) items — not code, handed over as exact steps**

- Confirm the email-OTP expiry is sane (dashboard-owned; not in `config.toml`).
- Confirm `techfleet.network` is on the auth redirect allow-list.
- The Send Email Hook already points at `auth-email-hook` in prod, so **no email-template config change** — only
  the edge-function redeploy.

**Rollout (`release-deployment-safety`)**

- Edge function deploys via `.github/workflows/deploy-edge-functions.yml` on `supabase/functions/` changes;
  frontend via Cloudflare Pages on merge. Additive; **no schema migration.**
- During the deploy window, already-sent `/auth/v1/verify` links **and** the new code/inert-landing links both
  work — no in-flight signup breaks (expand-style).
- Rollback = redeploy the previous edge function + revert the frontend; instant.

## Confirmation

- **BDD `@auth` / `@security` scenarios** (Gherkin, wired into CI): confirm-by-code happy path; confirm-by-button
  happy path; wrong code; expired code; reused code; already-confirmed → login; resend rate-limited;
  scanner-GET-does-not-consume (the inert landing runs no `verifyOtp` on load); enumeration-safe messaging.
- **Unit / contract:** `confirm-signup.service` `verifyOtp` mapping (code vs token_hash); the existing
  `auth-flow-lockdown.contract.test.ts` stays green.
- **Structural guard (this is what makes it un-regressable):** a smoke guard asserts `buildConfirmationUrl`
  routes `signup`/`invite`/`magiclink` to the inert `/auth/confirm` landing and **never** to `/auth/v1/verify`
  — the direct analog of the recovery assertion. A regression to the vulnerable branch fails CI, so the fix
  cannot silently rot.
- **Operator signal (SRE):** `use-confirm-signup-engine` records `auth_engine.confirm_signup_succeeded` /
  `auth_engine.confirm_signup_failed` (with the verify method + the classified error code, never the raw
  code/token_hash) — this is the confirmation-success-rate SLI/alert this ADR commits to.
- **Accessibility:** the code-entry screen (labelled input, focus management, error announced to screen readers)
  per `universal-accessibility-wcag`; the aria-live/status regions carry `translate="no"`
  (`check-translator-volatile-regions`).
- **Architecture gate:** `npm run check:architecture` exits 0 and `judge-arch` returns PASS (the four
  questions), or every finding is explicitly waived.
