
## Switch all system email URLs to `https://techfleet.network`

Replace every hardcoded `https://techfleetnetwork.lovable.app` reference used in email content / email-redirect targets with `https://techfleet.network` so every link recipients click goes to the custom production domain.

### Files to edit

1. **`src/lib/canonical-origin.ts`**
   - Change `PRIMARY_PRODUCTION_ORIGIN` to `https://techfleet.network`.
   - Keep `KNOWN_PRODUCTION_HOSTS` as-is (still includes `techfleetnetwork.lovable.app` and `www.techfleet.network`), so users already on any of those production hosts stay on their host, but every preview/localhost user's email links resolve to `techfleet.network`.
   - This automatically fixes `RegisterPage.tsx` (signup confirmation `emailRedirectTo`, resend confirmation) and `ForgotPasswordPage.tsx` (password reset link) because they call `getCanonicalAppOrigin()`.

2. **`supabase/functions/auth-email-hook/index.ts`**
   - Update `SAMPLE_PROJECT_URL` constant to `https://techfleet.network` (used in template preview rendering).

3. **`supabase/functions/resend-signup-confirmations/index.ts`**
   - Update `APP_URL` constant to `https://techfleet.network`. This affects the `redirectTo` passed to `auth.admin.generateLink()` (the actual confirmation URL clicked from the email) and the `siteUrl` shown in the rendered template.

4. **`supabase/functions/notify-applicant-status/index.ts`**
   - Update `APP_BASE_URL` constant to `https://techfleet.network`. This rewrites the CTA URL in the `applicant-status-change` template (e.g. `https://techfleet.network/applications/{id}` and `/journey`).

5. **`supabase/functions/quest-nudge/index.ts`**
   - Update `APP_URL` constant to `https://techfleet.network`. This rewrites the quest CTA in `quest-nudge` emails (`/my-journey/quest/{id}`).

6. **`supabase/functions/send-announcement-email/index.ts`**
   - Replace both `https://techfleetnetwork.lovable.app/updates?highlight={id}` strings with `https://techfleet.network/updates?highlight={id}` (one used for the email body button and plain-text, one used for the Discord mirror message).

7. **`supabase/functions/_shared/transactional-email-templates/applicant-status-change.tsx`**
   - Update the `previewData.ctaUrl` sample to `https://techfleet.network/applications` (preview-only; runtime value comes from the caller).

8. **`supabase/functions/_shared/transactional-email-templates/quest-nudge.tsx`**
   - Update the `previewData.questUrl` sample to `https://techfleet.network/my-journey`.

9. **`supabase/functions/_shared/transactional-email-templates/signup-confirmation-reminder.tsx`**
   - Update the `previewData.confirmationUrl` sample to `https://techfleet.network/confirm?token=sample`.

### Required Supabase Auth setting (one click, no code)

For Supabase-rendered auth emails (the `confirmationUrl` the auth-email-hook receives is constructed by Supabase from its **Site URL**), you must also update Supabase Auth → **Site URL** to `https://techfleet.network`. The current production domain `https://techfleetnetwork.lovable.app` should remain in **Additional Redirect URLs**, plus `https://techfleet.network/**` and `https://www.techfleet.network/**`. Without this, the action_link host inside auth emails will keep pointing at the old domain even though our wrapper text says `techfleet.network`. I'll remind you to do this after the code change ships.

### Deploy

After the file edits, redeploy the affected edge functions:
- `auth-email-hook`
- `resend-signup-confirmations`
- `notify-applicant-status`
- `quest-nudge`
- `send-announcement-email`

Frontend changes (`canonical-origin.ts`) take effect after the next publish.

### Out of scope

- `https://guide.techfleet.org/...` (interview-guide link) — intentionally points to the external handbook site.
- `mailto:info@techfleet.org` and `noreply@techfleet.org` — email addresses, not web URLs.
- `https://calendly.com/...` and other coordinator-supplied scheduling URLs — third-party.
- The system-managed unsubscribe footer — rendered by the Lovable Email backend using a token, not from any URL we control here.
