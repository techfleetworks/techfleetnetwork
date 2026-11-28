# ADR 20261126 — Apply migrations to prod as a reviewer-gated pipeline step, pre-merge (supersedes ADR-0045)

- Status: Accepted
- Date: 2026-11-26
- Deciders: TechFleet (owner)
- Supersedes: [ADR-0045](0045-auto-apply-migrations-on-merge.md) (unattended auto-apply on merge to `main`)
- Related: `.github/workflows/apply-migrations-prod.yml` (the new applier), `.github/workflows/deploy-migrations.yml` (deleted here — the superseded on-merge applier), ADR-0036 / `scripts/ci/check-db-schema-present.mjs` + the `db-schema-gate` job in `ci.yml` (the pre-merge detector this closes the loop on), `ci.yml` `migration-smoke` (the from-scratch proof), ADR-0026 / `supabase/migrations/CLAUDE.md` (expand/contract — why applying before the code ships is safe), `docs/architecture/audit-2026-08/migration-auto-apply.md` (the activation runbook, rewritten here). Skills: `release-deployment-safety`, `pattern-selector`, `compliance-data-lifecycle`, `sre-operational-readiness`.

## Context and problem statement

TFN's prod schema is still applied **by hand**: a maintainer runs `supabase db push` locally, with the
prod DB password typed on a laptop, before a migration PR can merge. That manual step is forced by the
**ordering of the existing safety gate**, and it keeps stalling real work — PR #534 (cohorts) is blocked
right now purely because its five migrations are not yet in prod and nobody has hand-run the push.

Why hand-apply is structurally required today:

- ADR-0036's **`db-schema-gate`** runs on every migration-touching PR and **fails closed if any object the
  PR's migrations declare is absent from prod** (it exists because migration `20260809161000` was committed
  but never applied, causing the Discord PGRST202 outage). So a brand-new migration's PR is **red until prod
  already has its objects**. The gate is a *pre-merge* gate.
- ADR-0045 tried to fix the manual apply by auto-applying on **merge to `main`** (`deploy-migrations.yml`,
  `on: push`). But an on-merge applier runs **after** merge, and the gate blocks merge **before** it. The two
  never meet: a new migration can't merge (gate red) to trigger the on-merge apply that would make the gate
  green. ADR-0045 never resolved this ordering, and in practice its workflow was **never activated** (no
  `SUPABASE_DB_PASSWORD` secret, ledger never bootstrapped), so hand-apply remained the only path.

So the real missing capability is not "apply on merge." It is **a way to apply a PR's migrations to prod
*before* merge, reliably and without a password on a laptop, with a human still approving the prod DDL.**
Once that apply has run, `db-schema-gate` goes green and the PR merges normally.

There is also an active trap: **activating ADR-0045 as written is now unsafe.** Any applier needs
`SUPABASE_DB_PASSWORD`. The moment that secret exists at repo scope, `deploy-migrations.yml`'s `on: push`
job becomes live and starts **auto-applying prod DDL on every merge with no human in the loop** — exactly
the foot-gun the hand-apply rule guards against. We cannot add the secret and leave that workflow in place.

## Decision drivers

- **Resolve the chicken-and-egg explicitly.** The apply must be able to run **pre-merge, on the PR branch**,
  so `db-schema-gate` can then pass. This is the crux.
- **Keep a human in the loop on every prod DDL apply.** The owner's bar: a person approves each apply; the
  mechanics (CLI, auth, project ref) are automated and the password is a stored secret, never typed locally.
  This is a *stricter* bar than ADR-0045's "no human gate," chosen deliberately.
- **Do not weaken any existing safety.** `db-schema-gate`, `migration-smoke`, expand/contract (ADR-0026),
  and RLS/auth/validation all stay exactly as they are. The goal is reliable, low-friction *applying*, not
  letting unapplied or unsafe schema merge.
- **No unattended prod DDL.** No apply may run from a `push`/`pull_request` trigger. The only way prod DDL
  runs is a human dispatch **plus** an environment approval.
- **Secret never touches a laptop.** The prod DB password lives only as a GitHub secret, scoped so it is
  exposed only after approval.

## Considered options

1. **Keep hand-applying locally (status quo).** Rejected: it *is* the friction. It needs the prod password
   on a laptop, it stalls every migration PR (PR #534 today), and "remember to run the push" is one forgotten
   step from the next drift.
2. **Activate ADR-0045 as written — unattended auto-apply on merge.** Rejected twice over: (a) it cannot
   resolve the ordering — on-merge is too late for a *pre-merge* gate, so it never unblocks a new migration
   PR; (b) it applies prod DDL with **no human gate**, which the owner has explicitly ruled out, and merely
   adding the secret it needs silently switches that unattended path on.
3. **Reviewer-gated apply, dispatched pre-merge, behind a protected `production` Environment (chosen).** A
   single `workflow_dispatch` workflow, `apply-migrations-prod.yml`, that a maintainer runs **against the PR
   branch**. Its apply job declares `environment: production`, which (with a required reviewer on that
   environment) **pauses until a human approves** and only then exposes `SUPABASE_DB_PASSWORD`. It runs
   `supabase db push` (apply only the pending migrations, in version order — never a reset), with a mandatory
   `--dry-run` preview first. No `push`/`pull_request` trigger exists, so prod DDL can never run unattended.
4. **A hosted staging DB that PRs apply to automatically, promoted to prod later.** Rejected for now: real
   value, but it is a much larger build (a second managed project, its own secrets, drift between staging and
   prod) and does not remove the prod-apply-before-merge requirement that `db-schema-gate` imposes. Option 3
   delivers the needed capability with the controls the owner asked for; staging can be layered on later.

## Decision outcome

**Chosen: Option 3.** Prod migrations are applied by **`.github/workflows/apply-migrations-prod.yml`**, a
reviewer-gated, human-dispatched pipeline step; **`deploy-migrations.yml` is deleted** and **ADR-0045 is
superseded**.

The normal flow for a migration PR becomes:

1. Open the PR. `migration-smoke` proves the migration applies cleanly from scratch; `db-schema-gate` is
   **red** (expected — the objects are not in prod yet). The PR is reviewed as usual.
2. A maintainer goes to **Actions → Apply migrations to prod → Run workflow**, selects the **PR's branch**
   as the ref, and `mode = push` (defaulting to `dry-run` for a preview).
3. The job declares `environment: production`. A **required reviewer** on that environment must approve; only
   after approval is `SUPABASE_DB_PASSWORD` exposed and `supabase db push` runs. It applies only migrations
   the remote ledger has not seen, in version order. A **branch-freshness guard** fails the job closed if the
   dispatched ref is diverged from `origin/main` (prevents reverse ledger drift — see below). To see the exact
   pending set *before* approving, dispatch `mode=dry-run` first and read its log: the in-job dry-run runs
   *after* approval, so it is a logged preview, **not** a gate.
4. Prod now has the objects. **Re-run `db-schema-gate`** (re-run the CI job / push an empty commit) — it goes
   **green**. The PR merges normally. Nothing applies on merge; there is no on-merge apply step.

Why this is safe to run *before* the code merges (not a regression):

- Expand/contract (ADR-0026, `supabase/migrations/CLAUDE.md`) already **requires every migration to be safe
  to apply while the old app code is still running** — a `db push` was never atomic with the frontend/edge
  deploy, so "schema live before its code" is the model migrations are *already* written for. Applying
  pre-merge is the same ordering the convention assumes; it does not introduce a new hazard.
- `migration-smoke` (blocking) has already proven the migration applies cleanly from scratch before anyone
  can dispatch the apply.
- `db push` is forward-only and ledger-based — it applies only pending migrations, never a reset.

Why prod can no longer silently fall behind `main` (the property ADR-0045 wanted, preserved without an
on-merge applier): a migration PR **cannot merge until prod already has its objects** (that is exactly what
`db-schema-gate` enforces pre-merge). So at the instant a migration lands on `main`, prod is already in sync —
earlier than ADR-0045's "eventually, after the on-merge job runs." `db-schema-gate` on `main` plus the daily
`config-preflight.yml` sweep remain as the post-merge detector for any out-of-band drift.

### Owner setup (one-time; the PR contains no secrets)

The workflow references these; the owner creates them in GitHub:

1. **Create a `production` Environment** (Settings → Environments → New environment → `production`).
2. **Add a required reviewer** to it (the owner / maintainers). This is the human approval gate.
3. **Deployment branches policy: leave it permissive (all branches), do NOT restrict to `main`.** The apply
   runs **on PR branches** by design (pre-merge), so a `main`-only branch policy would block the exact flow
   this ADR enables. The required reviewer — not a branch restriction — is the control.
4. **Add `SUPABASE_DB_PASSWORD` as an *environment* secret on `production` — NOT at repo scope** (Supabase →
   Settings → Database → Database password). Scoping it to the environment means it is exposed only after the
   reviewer approves; a repo-scoped copy would let a dispatch run prod DDL *without* the approval gate, so do
   not create one. `SUPABASE_ACCESS_TOKEN` already exists as a repo secret and is reused.
5. **Confirm the gate is live, once:** GitHub silently creates a missing environment with *no* reviewers, so
   after setup, dispatch one run and confirm it **pauses for approval**. If it runs without pausing, the
   required reviewer is missing or the password is repo-scoped — fix before trusting the gate. The approver
   should also check the dispatched ref does **not** modify `.github/workflows/apply-migrations-prod.yml`
   itself (the permissive branch policy means the ref's own YAML runs with the password after approval).
6. **One-time ledger bootstrap:** after confirming prod == `main` (`db-schema-gate` green on `main`), run the
   workflow once with `mode = bootstrap-ledger` (see the rewritten runbook). The repo predates any
   `supabase_migrations.schema_migrations` ledger (Lovable cutover), so `db push` needs an accurate baseline.

## Consequences

**Good**

- The chicken-and-egg is resolved: migrations are applied pre-merge under human approval, so `db-schema-gate`
  turns green and the PR merges. PR #534's class of stall disappears without weakening the gate.
- The prod DB password never touches a laptop; it is an environment secret released only on approval.
- Every prod DDL apply has a named human approver and an immutable run log (who, when, which ref, the dry-run
  diff, the apply) — better auditability than a local push, and it satisfies `compliance-data-lifecycle`'s
  "safe schema migration" expectation of an approved, recorded change.
- The unattended on-merge path is gone, and the secret can be added without silently switching it back on.

**Bad / accepted**

- **An apply step is still manual to trigger.** Accepted, and intended: the owner wants a human to approve
  each prod DDL change. It is one dispatch + one approval, not a local CLI dance with a password — the
  friction removed is the risky/forgettable part, not the human judgment.
- **The reviewer must re-run `db-schema-gate` after approving the apply** so the PR sees prod is now in sync.
  Accepted: a re-run (or an empty commit) is a known, documented step; it is the cost of keeping the detector
  as an independent pre-merge check rather than coupling it to the applier.
- **The `production` environment's branch policy must stay permissive.** A maintainer who hardens it to
  `main`-only would break pre-merge apply. Called out explicitly in setup and the runbook; the required
  reviewer is the real safety control, so a permissive branch policy does not lower the bar.
- **`db push` trusts the ledger.** If the ledger is wrong, the wrong set applies — which is why the one-time
  bootstrap runs only after prod is confirmed == `main`, and why `db-schema-gate` stays on to catch mismatch.
- **Reverse drift from an applied-then-abandoned branch.** Applying pre-merge writes the branch's migration
  versions into prod's ledger. If that PR is then abandoned, or its migration is rewritten/renamed/
  re-timestamped, prod holds a migration that is not on `main` — and `db-schema-gate` (which only detects
  objects *missing* from prod) cannot see it; the next `db push` can then fail on a ledger mismatch. Mitigated,
  not eliminated: the **branch-freshness guard** fails closed on a ref diverged from `origin/main` (catching
  the stale/rewritten-branch case), and the runbook instructs a `dry-run` on `main` after any abandoned or
  rewritten migration PR to surface divergence early. The residual (abandoning a fresh branch whose migration
  already applied) is accepted — recovered by a forward `migration repair` — and is the price of applying
  before merge, which the pre-merge gate requires.
- **The in-job dry-run is a logged preview, not a gate.** The reviewer approves before the dry-run output
  exists (the secret is needed to produce it), and a non-zero diff does not stop the apply. To review the
  exact set first, dispatch `mode=dry-run` separately and read its log before approving the `push`. Accepted:
  GitHub environments gate a job, not a step, so binding the approval to a pre-computed diff would need a
  second job; the separate-dry-run habit gives the same visibility at lower complexity.
- **The human gate depends on owner config being correct.** A missing required reviewer, or a repo-scoped
  copy of the password, makes the apply fail *open*. The workflow can't enforce this from inside, so setup
  step 5 requires confirming the first run pauses for approval. Accepted and documented; it is the same trust
  placed in every protected-environment deploy.

## Pattern-decision record (pattern-selector)

```
Problem / forces:       prod DDL must be applied reliably, pre-merge, without a laptop-held password, with a
                        human approving each change; must not weaken the existing pre-merge schema gate.
Forces evidence:        [observed] db-schema-gate is pre-merge + fail-closed (ci.yml:697, ADR-0036);
                        [observed] deploy-migrations.yml is on-merge + unactivated (its header + no secret).
Lifetime forces:        every future schema PR hits this ordering; ~767 live users; compliance wants an
                        approved, recorded prod change. Certain and recurring, not speculative.
Cost of deferring:      keep hand-applying → every migration PR stalls on a local password push (PR #534).
Candidates considered:  manual-local (status quo), unattended on-merge (ADR-0045), reviewer-gated pre-merge
                        dispatch (chosen), hosted staging promotion (deferred).
Decision:               reviewer-gated deployment stage — GitHub Environment approval gate on a
                        workflow_dispatch apply job. No GoF pattern; this is a release/deploy control.
Pros / cons accepted:   pro: human gate + automated mechanics + pre-merge timing; con: a manual trigger and
                        a gate re-run remain (accepted, they are the human judgment, not the friction).
Failure/rot prevented:  (a) unapplied-migration prod outage (PGRST202 class) — detector stays on;
                        (b) unattended prod DDL from an unmerged/untrusted change — no push trigger exists.
Security trade-off:     closes "prod password on a laptop" and "unattended DDL from any push"; the new
                        surface is who holds environment approval — controlled by the required reviewer.
Operational cost:       one dispatch + one approval + one gate re-run per migration PR; full run log.
Simpler alternative:    unattended on-merge (ADR-0045) — rejected: wrong timing for a pre-merge gate, no
                        human gate, and its secret silently activates the unattended path.
Adopt safely:           delete the on-merge workflow in the same change; secret is environment-scoped;
                        forward-only db push; expand/contract already makes pre-merge apply safe.
Verify correct application: workflow has NO push/pull_request trigger (grep); apply job declares
                        environment: production; dry-run precedes apply; secrets preflighted.
Verification status:    [observed] on the YAML in this PR; [reported] for the approval pause until the owner
                        creates the environment with a required reviewer (owner-configured, not in-repo).
ADR:                    this file.
Real guarantee:         the human gate is held by the GitHub Environment required-reviewer rule (owner
                        config), not by the YAML alone; the no-unattended-apply guarantee IS in the YAML
                        (absence of any push/PR trigger) and is grep-checkable.
```

## Release-safety evidence ledger (release-deployment-safety)

| Claim | State | Re-runnable source / limitation |
|---|---|---|
| Applying a migration pre-merge is backward-compatible with running old code | `documented` | ADR-0026 + `supabase/migrations/CLAUDE.md` require it; `migration-smoke` proves from-scratch apply. Limit: presence/shape still per ADR-0036 (presence) + migration-smoke (applies), not column-type diff. |
| The apply only ever runs with a human approval | `reported` | `apply-migrations-prod.yml` declares `environment: production`; the *approval* is enforced by the owner-created required reviewer on that environment, not by the YAML. Becomes `observed` once the environment exists and a run pauses for approval. |
| Prod DDL can never run unattended (no push/PR trigger) | `observed` | `apply-migrations-prod.yml` has only `workflow_dispatch`; grep the file for `on:` — no `push`/`pull_request`. `deploy-migrations.yml` (the only `on: push` applier) is deleted in this change. |
| Prod cannot silently fall behind `main` | `documented` | `db-schema-gate` blocks merge until prod has the objects (ADR-0036); `config-preflight.yml` daily sweep is the post-merge detector. Limit: the gate is one-directional (missing-only), so prod being *ahead* of main from an abandoned pre-merge apply is NOT detected — mitigated by the branch-freshness guard + a `dry-run` on main after an abandoned PR, accepted otherwise. |
| A stale/rewritten branch can't push migrations absent from main | `observed` | `apply-migrations-prod.yml` guard step: `git merge-base --is-ancestor origin/main HEAD` fails closed on a diverged ref (push/bootstrap modes). |
| The dry-run previews the exact set the reviewer approves | `not-assessed` → false as stated | The in-job dry-run runs *after* approval and does not gate; honest flow is "dispatch dry-run, read it, then dispatch push." Documented, not claimed as a gate. |
| Rollback | `documented` | Forward-only + expand/contract: a bad expand is undone by a later forward contract/fix migration, never an in-place drop of live data (ADR-0026). No automatic rollback step; this matches the repo's existing model. |

## Confirmation

- `apply-migrations-prod.yml` has **no** `push`/`pull_request` trigger (only `workflow_dispatch`), its apply
  and bootstrap steps run only under `environment: production`, it preflights `SUPABASE_ACCESS_TOKEN` +
  `SUPABASE_DB_PASSWORD`, fails closed if the dispatched ref is diverged from `origin/main`, and logs
  `supabase db push --dry-run` (a preview, not a gate) before applying.
- `deploy-migrations.yml` is deleted; ADR-0045 is marked superseded with the reason inline; the ADR index
  reflects both.
- `supabase/migrations/CLAUDE.md` and `docs/architecture/audit-2026-08/migration-auto-apply.md` describe the
  new reviewer-gated pre-merge apply flow.
- `npm run check:architecture` is green and `judge-arch` returns PASS on this change.
