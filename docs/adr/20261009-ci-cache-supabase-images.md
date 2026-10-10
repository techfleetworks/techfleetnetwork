# ADR 20261009 — Cache Supabase CLI Docker images in CI instead of re-pulling from ECR Public

Status: Accepted

## Context

The `migration-smoke`, `db-test`, and `e2e` jobs each run `supabase start`, which pulls
~10 container images (`postgres`, `realtime`, `storage-api`, `gotrue`, `kong`, `vector`,
`postgrest`, …) from `public.ecr.aws/supabase/*`. Amazon ECR Public rate-limits **anonymous**
pulls by both data volume and request count, so these jobs intermittently fail at
"Start local Supabase" with `toomanyrequests: Data limit exceeded` / `Rate exceeded`. This
flaked PR #393 repeatedly and is a standing source of red-for-no-reason CI.

A prior attempt (PR #397, closed) authenticated the pull with `aws ecr-public get-login-password`.
That required AWS credentials — and this project has no AWS footprint, so introducing an AWS
secret and client purely for CI was the wrong layer. We need a fix that uses nothing but GitHub
Actions' own primitives.

## Decision

Cache the Supabase images in the **GitHub Actions cache** and load them into the local Docker
daemon before `supabase start`, so a warm run performs no layer download from ECR Public.

- New composite action `.github/actions/cache-supabase-images` restores `~/.cache/supabase-images`
  (key `supabase-images-v1-<os>-<cli-version>`) and, on a hit, `docker load`s every cached tarball;
  on a miss it flags `SUPABASE_IMAGES_CACHE_MISS`.
- Each of the three jobs runs that action right before `supabase start`, and — only on a miss —
  a companion step `docker save`s the `public.ecr.aws/supabase/*` images into the cache dir after
  start, which the restore step persists at post-job.
- The cache key includes the pinned CLI version (`2.30.4`), so a CLI bump (which changes image
  tags) misses cleanly and re-populates.

This mirrors how the repo already makes DB migrations collision-free (versioned, cached inputs)
and how `node_modules` is cached — infrastructure solved in infrastructure (per the repo's
"fix config problems in config" directive), not with a new cloud dependency.

## Alternatives considered

- **Authenticate ECR Public (PR #397).** Needs AWS credentials; no AWS in this stack. Rejected.
- **Mirror the images to GHCR.** Durable but heavier: a separate mirror workflow, a registry to
  keep in sync per CLI bump, and `supabase start` would still have to be pointed at the mirror.
  More moving parts than caching for the same win. Deferred unless caching proves insufficient.
- **Just retry harder.** The jobs already retry; the data-volume limit is not retry-solvable.

## Consequences

- Warm runs skip the multi-hundred-MB layer download that trips the data limit; `supabase start`'s
  pull degrades to a cheap manifest check. The failure mode is removed for cached runs.
- Not a 100% elimination of registry contact: the **first** run per cache key (new key, or a CLI
  bump) still pulls from ECR Public once and can still flake there; subsequent runs are warm. This
  is an honest reduction, not an absolute guarantee.
- Cache storage: ~a few hundred MB per key under the repo's Actions cache budget; keys are evicted
  by GitHub's LRU, and a stale key simply causes one cold run.
- No new secret, no new cloud account, no AWS. One composite action + three two-line job additions.
