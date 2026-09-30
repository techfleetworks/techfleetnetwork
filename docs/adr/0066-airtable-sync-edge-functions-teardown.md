# ADR 0066 — Retire the four dead Airtable sync/diag edge functions (Airtable partially deprecated)

- Status: Accepted
- Date: 2026-09-27
- Deciders: Morgan Denner
- Epic: Integration teardown / Airtable deprecation

> Numbering: highest merged on main is ADR-0065 (shipathon resume fix, PR #401). 0062 (System Health
> cleanup, PR #377) and 0063 (Class Admin IA / Discord-connect) are reserved by in-flight branches,
> so this takes 0066.

## Context

Airtable was deprecated as an application integration. The **client** half landed first: ADR-era
PR #390 (`hardening/general-app-drop-airtable`) deleted the fire-and-forget `sync-airtable` invoke
and `syncToAirtable` from `general-application.service.ts`; `general_applications` (Supabase) is the
single source of truth for applications. This ADR is the **server-side** follow-up.

Four edge functions remained from the Airtable era:

- `sync-airtable` — pushed general-application rows into an Airtable table.
- `sync-airtable-network-stats` — read Airtable and wrote `network_stats_baselines` (id=1).
- `sync-airtable-roster` — project-roster sync.
- `airtable-diag` — an admin diagnostic that probed the Airtable connection.

An audit (caller/cron/schedule sweep across `src/`, `supabase/config.toml`, all migrations, and
`.github/workflows/`) established:

- **No live callers** of any of the four once #390 merged. `sync-airtable`'s only caller was the
  client invoke #390 removed; the other three had no `functions.invoke`/`invokeEdge`/`fetch` caller
  anywhere.
- **No schedule.** None appear in any `cron.schedule`/`pg_cron`/`net.http_post` migration, no
  `config.toml` `schedule =` key, and no workflow. `sync-airtable-network-stats` self-guards on an
  `x-cron-secret` (`NETWORK_STATS_CRON_SECRET`) but nothing was ever wired to poke it.
- **`sync-airtable-network-stats` writes are dead.** It only writes `network_stats_baselines`
  columns `airtable_general_apps` / `airtable_service_leadership_unique` / `airtable_masterclass_total`.
  Per ADR-0050, the live `get_network_stats` (migration `20260918140100`) is fully live-derived and
  **does not read `network_stats_baselines`**; only superseded May definitions did. Nothing reads
  what this function writes.

**Critical caveat — Airtable is only _partially_ dead.** Two edge functions still query the live
Airtable API on every request: `fetch-class-certifications` and `fetch-project-certifications` read
`api.airtable.com` (using `AIRTABLE_PAT` + `AIRTABLE_BASE_ID`) and upsert into
`class_certifications` / `project_certifications`. The certification feature is a **separate, live
Airtable dependency** that this teardown must not break.

## Decision

Delete the four dead functions and their now-orphaned bookkeeping, and **preserve everything the
live certification path depends on**.

Removed:

- `supabase/functions/{sync-airtable,sync-airtable-network-stats,sync-airtable-roster,airtable-diag}/`
  (including `sync-airtable/ownership.ts` + `ownership.test.ts`).
- Their `[functions.*]` blocks in `supabase/config.toml`.
- Their entries in `scripts/ci/no-inline-cors-grandfather.json` and the `airtable-diag` entry in
  `scripts/lint/dropped-supabase-error-grandfather.json` (both shrink-only lists — burning them down
  is the goal).
- The seven `arch-gate.waivers.json` baseline waivers for the four functions (shrinking the
  architectural backlog, per the gate rules).
- `src/test/smoke/sync-airtable-ownership.smoke.test.ts` — a hand-written smoke test that
  `readFileSync`s `supabase/functions/sync-airtable/index.ts` at module load and would `ENOENT`-crash
  the suite once the dir is gone.
- The stale `{ name: "AIRTABLE_API_KEY", ... required: false }` entry in
  `supabase/functions/environment-readiness/index.ts` — it names a var **no function reads** (the
  functions consume `AIRTABLE_PAT`/`AIRTABLE_BASE_ID`), so it validated nothing.
- Three remaining references to the deleted paths, caught by the judge-arch review pass (the first
  would have turned CI red): the `airtable-diag` and `sync-airtable-network-stats` entries in the
  `FUNCTIONS` array of `src/test/smoke/edge-stack-trace-exposure.smoke.test.ts` (it `readFileSync`s
  each entry at collection time → `ENOENT` once the dirs are gone); the
  `supabase/functions/sync-airtable/ownership.test.ts` path in the `deno test` list at
  `.github/workflows/ci.yml` (an explicit missing path fails the Edge-unit-gates job); and the stale
  `sync-airtable-network-stats` line in the coverage comment of
  `src/test/smoke/edge-audit-wrapper-coverage.smoke.test.ts`.

Regenerated (never hand-edited): all three edge-function manifests
(`supabase/functions.manifest.json`, `supabase/functions/edge-deploy-smoke/_manifest.json`,
`src/generated/edge-functions.manifest.json`) via `node scripts/ci/check-edge-function-coverage.mjs`.

Deliberately **kept**:

- `AIRTABLE_PAT` and `AIRTABLE_BASE_ID` secrets — the live cert functions need them.
- `src/lib/cert-title-utils.ts`, `supabase/functions/_shared/cert-title-utils.ts`,
  `ClassCertificationsTab.tsx`, `ProjectCertificationsTab.tsx` — they parse **live** Airtable cert
  data (they filter out Airtable record IDs from display titles), so they are meaningful, not dead.
- The `airtableusercontent.com` URL-host allow rule (`decisions.md`, `_shared/url-host.ts`,
  `ingest-*-csv`) — attachment-host validation for live CSV/cert flows.

## Alternatives considered

- **Delete all Airtable code and both cert-fetch functions / secrets too.** Rejected — it would break
  the live certifications feature. The "Airtable is deprecated" confirmation covered the
  general-application sync, not the certification lookup, which still reads Airtable at request time.
  Removing `AIRTABLE_PAT`/`AIRTABLE_BASE_ID` would take certifications down.
- **Stack this teardown on #390 / split it across two PRs.** Rejected in favour of waiting for #390
  to merge and doing all four deletions plus the shared bookkeeping (config, three manifests,
  grandfather lists, waivers) in one coherent PR off updated `main`. The shared files enumerate all
  four functions together, so splitting them across PRs would fragment the same edit and couple merge
  order.
- **Also drop the now-orphaned `network_stats_baselines` table + its `airtable_*` columns in this
  PR.** Deferred — that is a hand-applied prod DB migration (no prod CI), independent of the function
  deletion, and out of scope for this change. Recorded as a follow-up, not silently done.
- **Also retire the two auto-generated smoke stubs (`airtable-sync.smoke.test.ts`,
  `project-roster-sync.smoke.test.ts`).** Deferred — they are generated from `public.bdd_scenarios`
  by `scripts/generate-smoke-tests.ts` and only assert `App.tsx` length / `edgeFunctionDirs` is
  non-empty, so they still pass and do not reference the deleted dirs. Deleting the files alone would
  regenerate them; the clean retirement is to mark the "Airtable Sync" and "Project Roster Sync"
  `bdd_scenarios` rows retired in the DB and regenerate — a DB action, recorded as a follow-up.

## Consequences

**Positive**

- Four dead deployed functions and their attack surface (incl. an admin diagnostic that read
  service-role secrets and hand-rolled CORS/auth) are gone.
- The two shrink-only grandfather lists and the arch-gate waiver backlog each get smaller, as
  intended.
- `environment-readiness` no longer reports on a secret nothing uses.

**Negative / accepted**

- Airtable is **not** fully removed: the certification lookup remains a live Airtable dependency, and
  `AIRTABLE_PAT`/`AIRTABLE_BASE_ID` stay configured. Fully exiting Airtable requires migrating
  certifications off it — separate, larger work.
- `network_stats_baselines` becomes a fully orphaned table (nothing writes it after this PR; nothing
  read it before). Left in place for a follow-up drop migration.
- Two smoke stubs remain that describe retired feature areas; harmless (green) until their DB rows
  are retired.

**Manual steps (not in this PR)**

- **Supabase dashboard secrets:** after merge, unset `AIRTABLE_TABLE_NAME` (used only by
  `sync-airtable`) and `NETWORK_STATS_CRON_SECRET` (used only by `sync-airtable-network-stats`).
  **Keep** `AIRTABLE_PAT` / `AIRTABLE_BASE_ID`.
- **Deploy:** deleting the function dirs removes them on merge via `deploy-edge-functions.yml`. No
  cron to disable first (none existed). Rollback is a revert.
