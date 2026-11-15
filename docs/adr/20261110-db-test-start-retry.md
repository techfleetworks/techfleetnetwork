# ADR 20261110 — Retry `supabase start` in db-test so a transient 502 can't false-page main

- Status: accepted
- Date: 2026-11-10
- Deciders: repo owner (mdenner), in session
- Relates to: ADR 20261110-db1-anon-definer-completeness (added the `db_tests` trigger), ADR
  20261110-alerting-cannot-go-dark (main-failure-alert), RP-H TST-3 (future db-test promotion)

## Context

The `db-test` job starts a local Supabase (`supabase start`), which pulls its Docker images from ECR
Public on a cache miss. That pull intermittently returns `Error status 502` ("invalid response from the
upstream server"). `db-test` has **no `continue-on-error`**, so a failed `supabase start` fails the whole
CI run; on `main` that fires `main-failure-alert` (ADR 20261110-alerting-cannot-go-dark).

This happened for real on 2026-11-10: the RP-I merge commit's `db-test` died on a 502 during
`supabase start` (before pgTAP ran), the CI run concluded `failure`, and `main-failure-alert` opened a
GitHub issue — a **false page** from a transient infra flake, not a code failure. A re-run passed
unchanged. The `db_tests` trigger added in the RP-I PR makes `db-test` run more often, so this flake
class now reaches `main` more often.

Evidence: `observed` — the failing job log shows `Error status 502 … upstream server` at the
`supabase start` step (run 42897435969, job 130114292304); the re-run of the same commit passed.

## Decision

Wrap `supabase start` in the db-test job in a bounded **retry with backoff** (3 attempts, `supabase stop`
between tries, 15s → 30s → 60s), mirroring the CLI-download retry already in the same job. A transient
registry 502 is retried and clears; a **persistent** outage still fails after the attempts — that is a
real signal worth surfacing, not something to hide.

Deliberately **not** done:
- **`continue-on-error: true` on db-test.** That would stop it failing the run (and paging) on *any*
  failure — including a real pgTAP regression — which weakens the signal and conflicts with RP-H TST-3's
  plan to promote db-test to a blocking gate. The retry fixes the *flake* without blinding the *signal*.

## Consequences

- A transient `supabase start` 502 no longer false-pages `main`; a genuine or persistent failure still
  does. Reduces false `main-failure-alert` noise introduced by the more-frequent `db-test` runs.
- **Limitation (honest):** this is a workflow-step resilience change with **no discrimination test** — a
  retry-on-502 wrapper cannot be unit-tested without mocking the Supabase CLI, which is not worth the
  machinery. It is verified by CI behavior (the step's log shows the retry on a flake), not by a committed
  red-on-revert test; that is the honest gap for this class of change. The retry count (3) and backoff are
  a judgment, not a proof that 3 is always enough — a longer outage still fails.
