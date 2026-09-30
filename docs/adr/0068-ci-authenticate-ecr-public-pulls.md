# ADR 0068 — Authenticate ECR Public pulls in CI to stop the anonymous rate limit

- Status: Accepted
- Date: 2026-09-27
- Deciders: Morgan Denner

## Context

The CI jobs that boot a local Supabase (`migration-smoke`, `db-test`, and the `e2e` shards in
`.github/workflows/ci.yml`) run `supabase start`, which pulls the Postgres and companion images from
`public.ecr.aws/supabase/*`. Those pulls are anonymous, and ECR Public throttles anonymous pulls with
`toomanyrequests: Data limit exceeded`. Whichever image-pulling job happens to run during a throttle
window fails, with retries exhausted. This was observed repeatedly on PR #393: first `db-test`, then
three `e2e` shards, all with the same registry error, none related to the PR's code. Re-running is a
band-aid, the flake returns on any DB or e2e PR. Per the repo rule to fix config problems in config,
the fix belongs in the workflow, not in retries.

## Decision

Before `supabase start` in each of the three Supabase-booting jobs, log in to ECR Public with AWS
credentials stored as GitHub Actions secrets, then let `supabase start` reuse that authenticated
docker session. Authenticated ECR Public pulls get a far higher limit than anonymous ones.

The step is guarded with `if: ${{ secrets.ECR_PUBLIC_AWS_ACCESS_KEY_ID != '' }}`, so a fork or a run
before the secret exists simply skips it and falls back to anonymous pulls. There is no regression:
absent the secret, behavior is exactly as before.

Required repo secrets (Settings, Secrets and variables, Actions):
- `ECR_PUBLIC_AWS_ACCESS_KEY_ID`
- `ECR_PUBLIC_AWS_SECRET_ACCESS_KEY`

They belong to an AWS IAM user that can mint an ECR Public auth token. Minimal permissions:
`ecr-public:GetAuthorizationToken` and `sts:GetServiceBearerToken` (the managed policy
`AmazonElasticContainerRegistryPublicReadOnly` covers it). Read-only, no write or production access.

## Consequences

- Once the secret is set, `db-test`, `migration-smoke`, and `e2e` stop flaking on the anonymous ECR
  Public limit. This helps every DB or e2e PR, including the rest of the class-registration program.
- New dependency: a minimal, read-only AWS credential in CI. If it is ever removed, the guarded step
  skips and CI returns to the anonymous (flaky) behavior rather than breaking.
- If the Supabase CLI later pulls some images from Docker Hub as well, a `docker.io` login would be
  added the same way. The observed failures were all `public.ecr.aws`, so only that is addressed now.
- Proof is the CI run itself, this cannot be reproduced locally. After the secret is added and CI
  re-runs, the `toomanyrequests` errors should be gone from the Supabase-booting jobs.
