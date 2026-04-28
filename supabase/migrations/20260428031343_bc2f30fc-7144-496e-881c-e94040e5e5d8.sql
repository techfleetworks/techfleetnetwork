INSERT INTO public.bdd_scenarios (
  feature_area_number,
  feature_area,
  scenario_id,
  title,
  gherkin,
  status,
  test_type,
  test_file,
  notes
) VALUES
(
  82,
  'System email delivery',
  'EMAIL-SIGNUP-QUEUE-SELF-HEAL-001',
  'Signup auth emails drain from the queue without unsubscribe-data DLQ failures',
  'Feature: System email delivery
Scenario: Signup verification email is queued and sent reliably
  Given a member signs up and a verification email is queued
  And the queued auth email is missing unsubscribe metadata
  When the email dispatcher processes the auth email queue
  Then the dispatcher creates or reuses safe unsubscribe metadata
  And the email is sent instead of retried into the dead-letter queue',
  'implemented',
  'both',
  'supabase/functions/auth-email-hook/index.ts; supabase/functions/process-email-queue/index.ts',
  'Regression coverage for auth emails routed through app-email sending requirements.'
),
(
  81,
  'Discord identity linking',
  'DISCORD-CONNECT-RESILIENT-002',
  'Discord connect supports IDs, mentions, broader search, and reasonable duplicate retries',
  'Feature: Discord identity linking
Scenario: Existing Discord member is found despite naming variations
  Given a signed-in member belongs to the Tech Fleet Discord server
  When they enter a Discord ID, mention, username, display name, or nickname
  Then the backend searches safely with retry protection
  And the member is offered a verified match instead of a false not-found error',
  'implemented',
  'both',
  'src/pages/ConnectDiscordPage.tsx; supabase/functions/resolve-discord-id/index.ts',
  'Regression coverage for false Discord not-found errors and overly aggressive duplicate throttling.'
),
(
  83,
  'Admin passkey security gate',
  'PASSKEY-SESSION-RPC-001',
  'Valid passkey verification satisfies the current login session even when device binding is unavailable',
  'Feature: Admin passkey security gate
Scenario: Admin passkey succeeds without local device binding
  Given an authenticated admin has an enrolled passkey
  And local browser device binding is unavailable or fails
  When the admin successfully verifies the passkey assertion
  Then the current login session is marked verified on the backend
  And the passkey dialog does not reopen for that same session',
  'implemented',
  'both',
  'src/services/passkey-login.service.ts; src/hooks/use-passkey-login-gate.ts; supabase/functions/passkey-auth-verify/index.ts',
  'Regression coverage for passkey loops caused by requiring trusted-device proof instead of session proof.'
),
(
  84,
  'Google authentication',
  'GOOGLE-ADMIN-LOGIN-RETRY-001',
  'Google admin login uses explicit account selection and stable redirect handling',
  'Feature: Google authentication
Scenario: Admin signs in with Google on the first attempt
  Given an admin chooses Google sign-in
  When the provider flow starts
  Then the browser asks them to choose the intended Google account
  And the app stores the requested return path before redirecting
  And the login should not require a second attempt because of stale provider account state',
  'implemented',
  'unit',
  'src/components/GoogleSignInButton.tsx; src/contexts/AuthContext.tsx',
  'Regression coverage for first-attempt Google login failures caused by ambiguous cached Google account state.'
),
(
  85,
  'MFA enforcement',
  'MFA-MEMBER-NO-SURPRISE-PROMPT-001',
  'Members are not forced into an unexpected 2FA challenge',
  'Feature: MFA enforcement
Scenario: Non-admin member signs in normally
  Given a signed-in user is a regular member and not an admin
  When the global MFA guard evaluates the session
  Then it must not open a mandatory 2FA prompt
  And the member can continue into the app without being blocked',
  'implemented',
  'unit',
  'src/components/MfaEnforcementGuard.tsx',
  'Regression coverage for surprise 2FA prompts shown to non-admin members.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();