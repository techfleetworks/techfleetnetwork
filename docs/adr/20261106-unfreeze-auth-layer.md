# ADR 20261106 — Lift the auth-layer freeze for a login / account-setup refactor

- Status: accepted
- Date: 2026-11-06
- Deciders: repo owner (mdenner), in session

## Context

The auth layer was frozen by `CLAUDE.md` ("Auth is frozen") and the `06-auth-flow-lockdown` skill:
`src/integrations/supabase/client.ts`, the `main.tsx` boot block, `src/lib/auth/**`,
`src/features/auth/**`, and the sign-in/up/reset/MFA UI could not be edited without the full auth
regression suite passing, and the freeze was described as "do not edit." The freeze existed because
auth is the highest-blast-radius area on a production app (~767 real users).

The owner reported multiple UX bugs in the login / account-setup flow (signup form rendered under the
"account exists" panel; the "Enter your confirmation code" button did nothing; confirmation codes
appeared to expire immediately) and decided the flow needs a real refactor, which the "do not edit"
freeze blocks. See `docs/` handoff for the triaged bugs.

Note: the numbered `0X-*.skill.md` files that `CLAUDE.md` references (including
`06-auth-flow-lockdown.skill.md`) are **not tracked in this repo** — the enforced auth invariants live
in `CLAUDE.md` and in the contract tests under `src/features/auth/testing/contract/`. There is no
in-repo skill file to amend; if a local/global copy exists, the owner should update it to match.

## Decision

Lift the **"do not edit" freeze** on the auth layer, effective 2026-11-06, to allow the refactor.
The decision deliberately **moves the safety bar from a process rule to CI enforcement**, it does not
remove it. Every auth change must still:

1. Keep the **auth regression suite** and the lockdown **contract tests** green in CI before merge
   (`auth-flow-lockdown.contract.test.ts`, `auth-mfa-lockdown.contract.test.ts`).
2. Use exactly **one** Supabase client instance.
3. Never weaken auth, RLS, validation, or types (prime directive #5).

`CLAUDE.md` is updated accordingly: the "Auth is frozen" section becomes "Auth is under active
refactor," and the skills index entry drops the "frozen" wording while keeping the invariants.

## Alternatives considered

- **Keep the freeze.** Blocks the refactor the owner has asked for; the known UX bugs persist.
- **Lift the freeze AND relax the contract tests / regression suite.** Rejected — that would remove the
  real safety, not just the process gate, on a production auth layer.
- **Big-bang rewrite under the freeze with per-change waivers.** More friction and risk than lifting the
  freeze while keeping CI as the gate.

## Consequences

- The auth layer can be edited as part of the refactor; the contract tests + regression suite are now
  the gate, enforced per-PR in CI.
- Risk rises (auth is editable), bounded by the retained CI gates, the one-client invariant, and the
  "never weaken auth" directive. The refactor should still be staged, each change root-caused and
  proven, per the handoff.
- If the contract tests prove too narrow to catch a regression the refactor could introduce, widen them
  (shrink the judgment surface) rather than re-imposing a blanket freeze.
