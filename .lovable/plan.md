## Problem

After today's signing-key rotation, `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` returns `currentLevel: aal1, nextLevel: aal1` even for users with a verified TOTP factor. Our gate only consults `listFactors()` when `nextLevel === "aal2"`, so the 2FA dialog never opens — admins (including the user) silently log in at AAL1. DB confirms zero `two_factor_login_sessions` rows since May 5 across 5 admins with verified TOTP.

Three call sites are affected:
- `src/services/mfa.service.ts::getAssuranceLevel` (the broken short-circuit)
- `src/components/MfaEnforcementGuard.tsx` (post-mount global guard)
- `src/pages/LoginPage.tsx` line 208 (inline post-login check)

The grace-period nudge for newly promoted admins also needs to become **truly persistent and modal**, not the current passive top-of-page banner that's easy to scroll past.

## Requirements (mapped to BDD scenarios)

### R1 — Any user with a verified TOTP factor is challenged on every login
Covers admin Scenarios 1 & 2 AND member Scenario 2 (non-admin with 2FA enabled).
1. After successful password or OAuth login, the client MUST call `MfaService.listFactors()` directly (not via the AAL short-circuit).
2. If any verified TOTP factor exists AND the current JWT's `aal` claim ≠ `aal2`, the `MfaChallengeDialog` MUST open immediately, blocking all routes.
3. Cancel/close MUST sign the user out (already implemented).
4. Successful verify MUST elevate session to AAL2 and write a fresh `two_factor_login_sessions` row (already implemented).

### R2 — Members without 2FA log in normally
Member Scenario 1. When `listFactors()` returns no verified TOTP factor:
- No challenge dialog renders.
- No grace popup renders (grace logic is admin-only).
- User lands on `/dashboard` (or `from`) with zero added clicks. **No UX regression.**

### R3 — Newly promoted admin who already has 2FA
Admin Scenario 2. Same path as R1 — promotion does not change the factor inventory. The global guard handles this automatically; no special branch needed.

### R4 — Newly promoted admin without 2FA, inside the 5-day grace window
Admin Scenarios 3 + 4. On every authenticated page render, if `isAdmin && !hasVerifiedTotp && admin_2fa_grace_active === true`:
1. A new `AdminTwoFactorGraceDialog` (modal, non-dismissible until set up OR user signs out) MUST open.
2. Dialog MUST show remaining days and a primary CTA "Set up 2FA now" → `/profile/edit?tab=account`.
3. Secondary action: "Sign out".
4. Dialog stays mounted across navigations (rendered in `AppLayout`).
5. Polls `MfaService.hasVerifiedTotp()` every 10s while open; auto-closes on success — no page reload required.
6. The existing passive `AdminTwoFactorSetupBanner` is removed in favor of the modal to satisfy "I should SEE the popup".

### R5 — Grace expired
Existing `AdminRoute` block screen stays. Outside `/admin/*` the user keeps full access — already correct.

### R6 — Resilience
- Never trust `currentLevel`/`nextLevel` JWT claims as the sole signal. Always cross-check `listFactors()` (cached for 60s in module memory to avoid extra calls).
- Read AAL by decoding `session.access_token` payload locally (works regardless of signing-key rotation state).
- Guard MUST re-evaluate on `auth.onAuthStateChange` events `SIGNED_IN`, `TOKEN_REFRESHED`, `USER_UPDATED`. Event handler MUST NOT `await` Supabase calls — schedule via `queueMicrotask` (deadlock prevention).
- All RPCs (`admin_2fa_grace_active`, `admin_2fa_grace_deadline`, `mark_two_factor_login_verified`) keep their existing JWT validation — no edge function or DB changes required.

## Implementation

### Code changes

1. **`src/services/mfa.service.ts`**
   - Add `getMfaGateDecision()` returning `{ hasVerifiedTotp, currentAal, needsChallenge }`.
   - `needsChallenge = hasVerifiedTotp && currentAal !== "aal2"` — independent of `nextLevel`.
   - Decode `currentAal` from the JWT payload locally.
   - Keep `getAssuranceLevel` as a thin wrapper for backward compatibility, but rewrite its `needsChallenge` to use the same logic.

2. **`src/components/MfaEnforcementGuard.tsx`**
   - Switch to `getMfaGateDecision()`.
   - Subscribe to `supabase.auth.onAuthStateChange` for `SIGNED_IN`, `TOKEN_REFRESHED`, `USER_UPDATED`; re-run check via `queueMicrotask`.
   - Add `window` focus listener for re-evaluation.
   - Stays purely member-aware: no admin/grace branching here.

3. **`src/pages/LoginPage.tsx`**
   - Replace the inline `getAssuranceLevel` call at line 208 with `getMfaGateDecision()`. Open the dialog when `needsChallenge` is true.

4. **New `src/components/AdminTwoFactorGraceDialog.tsx`**
   - Non-dismissible `Dialog` (no `onInteractOutside`, no X button) for admins in grace with no TOTP.
   - Shows deadline + days remaining (from `admin_2fa_grace_deadline` RPC).
   - Primary action: `Link to="/profile/edit?tab=account"`.
   - Secondary action: "Sign out" → `supabase.auth.signOut()`.
   - Polls `MfaService.hasVerifiedTotp()` every 10s while open; auto-closes on success.

5. **`src/components/AppLayout.tsx`**
   - Mount `AdminTwoFactorGraceDialog` once next to `MfaEnforcementGuard`.
   - Remove the three duplicate `AdminTwoFactorSetupBanner` mount points and the import.

6. **`src/components/AdminTwoFactorSetupBanner.tsx`** — delete file. The modal supersedes it.

7. **`src/components/AdminRoute.tsx`** — keep the in-page grace strip and post-grace lockout screen. The new modal sits on top, dismissible only via successful enrollment, so admin route navigation still works after setup.

### BDD scenarios (insert into `bdd_scenarios`, tri-layer `[UI]`/`[DB]`/`[Code]` Then-clauses)

Admin scenarios:
- `AUTH-2FA-LOGIN-GATE-003` — Existing admin with TOTP is always challenged at login (covers stale-claim case + happy path).
- `AUTH-2FA-LOGIN-GATE-004` — Cancel on the challenge dialog signs out and returns to `/login`.
- `AUTH-2FA-PROMOTION-001` — Newly promoted admin who already has TOTP gets the standard challenge after redirect from `/confirm-admin`.
- `AUTH-2FA-PROMOTION-002` — Newly promoted admin without TOTP, inside grace, sees the persistent setup modal on every page; CTA goes to `/profile/edit?tab=account`.
- `AUTH-2FA-PROMOTION-003` — Setup completion auto-closes the modal within one poll cycle and writes a verified factor to `auth.mfa_factors`.
- `AUTH-2FA-PROMOTION-004` — When `admin_2fa_grace_active` returns false, modal does not render (AdminRoute lockout takes over).

Member scenarios (new):
- `AUTH-2FA-MEMBER-001` — **Member without 2FA logs in normally.**
  - GIVEN I am not an admin AND I have no verified TOTP factor
  - WHEN I submit the correct email + password on `/login`
  - THEN [UI] no `MfaChallengeDialog` opens and I land on the page in `from` (default `/dashboard`)
  - AND [DB] `auth.sessions.aal = 'aal1'` for my new session and no row is written to `two_factor_login_sessions`
  - AND [Code] `getMfaGateDecision()` returns `{ hasVerifiedTotp: false, needsChallenge: false }`.
- `AUTH-2FA-MEMBER-002` — **Member with 2FA enrolled is challenged on login.**
  - GIVEN I am not an admin AND I have a verified TOTP factor in `auth.mfa_factors`
  - WHEN I submit the correct email + password on `/login`
  - THEN [UI] the `MfaChallengeDialog` opens immediately and the rest of the app is inert behind it
  - AND [DB] no `auth.sessions` row reaches `aal = 'aal2'` until I submit a valid code; on success a fresh row is written to `two_factor_login_sessions` with `verified_at = now()`
  - AND [Code] `getMfaGateDecision()` returns `{ hasVerifiedTotp: true, currentAal: 'aal1', needsChallenge: true }` and `MfaService.verifyChallenge` resolves successfully before navigation.

### Tests

- Update `src/test/ui/MfaEnforcementGuard.test.tsx` to mock `getMfaGateDecision`.
- New `src/test/ui/AdminTwoFactorGraceDialog.test.tsx` — visible-when-grace-active, hides-on-enrollment, sign-out path.
- New `src/test/services/mfa.service.test.ts` — `getMfaGateDecision` returns `needsChallenge` correctly across all 4 combinations of `(hasVerifiedTotp, currentAal)`.

### Manual verification

1. Log in as admin with TOTP — challenge appears immediately, cannot click around it.
2. Cancel — redirected to `/login`, session cleared.
3. Verify with valid code — `two_factor_login_sessions` gets a new row, `auth.sessions.aal = aal2`.
4. Log in as a member with no TOTP — no challenge, no popup, lands on `/dashboard`.
5. Enroll TOTP as a member, log out, log back in — challenge appears.
6. Promote a fresh user via `/confirm-admin`, log in without enrolling — modal appears on `/dashboard`, persists on `/courses`, disappears within ~10s after completing enrollment.
7. Wind grace back to expired (DB) → modal hidden, AdminRoute lockout shown for `/admin/*`, normal pages still work.

## Out of scope

- No edge function or DB migration changes — all required RPCs already exist.
- OAuth callback flow itself is unchanged; the global guard catches OAuth logins because it re-runs on `SIGNED_IN`.
- Email template content unchanged.
