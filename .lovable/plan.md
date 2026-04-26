This looks like the shared test admin credentials were used by an automated/local test session, not a normal user browsing the live app.

Evidence in the logs:
- The login is for `morgan@trycatalog.com` / Joe Ferguson.
- The request referrer is `http://127.0.0.1:4173/`, which is a local preview/test server, not the public website.
- This account is documented in project memory as a shared browser-based test account.
- Because it is an admin-capable shared credential, anyone or any automation with access to the project context could potentially use it.

Plan to stop this from happening again:

1. Lock down the test admin account immediately
   - Revoke active sessions for `morgan@trycatalog.com`.
   - Rotate its password.
   - Remove or downgrade admin role unless this account truly needs admin access.

2. Remove shared admin credentials from project memory
   - Delete the stored plaintext password reference.
   - Keep only non-sensitive notes like “test account exists,” without credentials.

3. Replace shared admin testing with safer access
   - Use named admin test accounts per developer/tester.
   - Keep all admin test accounts behind passkey/MFA.
   - Avoid using real-looking personal names for automation accounts.

4. Add admin login alerting
   - Notify admins when any admin account logs in.
   - Include time, rough location/IP metadata, and whether it came from local preview, published app, or custom domain.

5. Add audit visibility
   - Add a clear Admin Security Activity view showing recent admin logins, failed logins, session revocations, role changes, and suspicious auth events.

6. Add BDD coverage
   - Scenario: shared credentials are not stored in app/project memory.
   - Scenario: admin login creates an audit event.
   - Scenario: admin session revocation invalidates future use.
   - Scenario: non-admin test accounts cannot access admin areas.