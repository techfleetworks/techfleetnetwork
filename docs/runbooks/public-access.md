# Runbook — Public Access (logged-out surface)

The surface a logged-out visitor sees: the `public-*` edge gateways, the prerendered
static routes, and the public pages/nav. Read with
`docs/public-access/PRODUCTION-READINESS-REVIEW.md` (SLOs, alerting, go/no-go).

Prod Supabase project: `pzvqxdgoztbfikfuifix`. Frontend host: Cloudflare Pages.

## What runs where

| Piece | Where it runs | Serves |
|---|---|---|
| Public pages + nav | Cloudflare Pages (static `dist/`, SPA) | the UI; boots and fetches the gateways |
| Prerendered route head | `dist/<route>/index.html` written at **build** by `scripts/prerender-public.ts` | crawlers' `<head>` (title/OG/JSON-LD); the body is the SPA shell |
| `public-classes`, `public-class-detail`, `public-courses`, `public-project-openings`, `public-project-detail` | Supabase edge functions (service-role, anon field allowlist) | the catalog data (anon has **no** table grants — A6) |
| Field visibility | `_shared/public-visibility.ts` (frozen by `public-feed-contract.v1.json`) | which §6 fields anon may read |

## Deploy

Merging to `main` deploys **both** automatically:
- Cloudflare Pages → the frontend. The build runs `vite build` → `post-build-smoke`
  → `tsx scripts/prerender-public.ts` (writes `dist/<route>/index.html`). **If the
  prerender throws, the build fails and the deploy does not ship** — caught by
  `main-failure-alert` (Deploy frontend). This is intentional: a broken prerender
  must not silently ship a stale/empty head.
- `.github/workflows/deploy-edge-functions.yml` → the gateways, then runs the
  **post-deploy smoke** `scripts/ci/smoke-public-catalog.mjs` (verifies each public
  gateway is live). A red smoke = the gateways are down/misdeployed.

Manual edge redeploy (without merging):
```
supabase functions deploy public-classes public-class-detail public-courses public-project-openings public-project-detail --project-ref pzvqxdgoztbfikfuifix
```

## Rollback (mitigate first, diagnose later)

- **Frontend bad / stale:** in Cloudflare Pages, roll back to the previous
  deployment, or revert the offending commit on `main` (re-deploys the prior build).
- **A gateway bad:** redeploy the prior version of the function (`git checkout` the
  prior `supabase/functions/<fn>` and `supabase functions deploy <fn>`), or revert the
  commit.
- **A data-exposure breach (SEV1):** this is confidentiality, not availability —
  do not wait for a clean rollback. Take the leaking gateway offline or patch its
  allowlist immediately (`public-visibility.ts`), redeploy, then rotate anything the
  leak may have exposed. The A7 guard + contract test should have blocked it pre-merge;
  a breach that reached prod is an escaped defect → add the missing guard case.

## Failure modes → fix

| Symptom | Likely cause | Fix |
|---|---|---|
| Public page shows "not found" for a real, published item | gateway 404/5xx, or the item lost `published`/active status | check the gateway in edge logs; confirm the item's status; the gateway filters by `status`/`published_at` |
| Public page spins forever | gateway hung > 8s (the `getJson` abort) surfaces as the error state; if not, a build/SPA break | check edge logs for the gateway; check the Cloudflare deploy |
| Crawler shows a **stale title** for an unpublished item | prerendered `<head>` is build-time; not yet rebuilt | re-deploy the frontend (any merge to `main`) to regenerate `dist/`; users already see the correct not-found (SPA 404s live). See PRR §4 |
| A gateway returns a field it should not | §6 allowlist regression | **SEV1** — see rollback; patch `public-visibility.ts`, bump `public-feed-contract.v1.json`, redeploy |
| `smoke-public-catalog` red after deploy | a gateway is down/misdeployed | redeploy the named function; check `supabase functions list` |
| `main-failure-alert` GitHub issue opened | a production-critical workflow failed | open the issue's linked run; roll back if prod is stale/broken |

## Dashboards & logs

- **Supabase → Edge Functions → Logs** (project `pzvqxdgoztbfikfuifix`): per-gateway
  request counts, latency, 5xx, and the `console.error` + `withAuditWrapper` audit
  events.
- **Cloudflare → Pages → Deployments**: build status, deploy history, rollback.
- **GitHub Actions**: `Deploy frontend (Cloudflare)`, `Deploy edge functions` (+ its
  post-deploy smoke), `CI`. A failure here pages via `main-failure-alert`.

## Escalation

- Primary signal: the `main-failure-alert` Discord message, or (if the webhook is
  unset) the auto-opened GitHub issue labelled `main-failure`.
- Owner / escalation: mdenner (repo owner).
- Known Held item: a steady-state gateway 5xx/latency **burn-rate** page does not yet
  exist (platform-wide, ADR-20261110). Until it does, a steady-state burn is found by
  inspecting edge logs, not by a page. Treat a missed burn as a missing alert to add.

## SLOs (summary — full in the PRR)

- Gateway availability 99.5% / 30d (a `404` is a success); latency 95% < 800 ms / 30d.
- Field correctness: 0 §6-disallowed fields to anon (hard invariant, proven by gates).
- Freshness: live immediate; prerendered meta ≤ 1 deploy cycle.
