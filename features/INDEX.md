# BDD feature index

The repo's Gherkin `.feature` files are the single source of truth for behaviour. This index is the
human-readable view of the centralized datastore `features/bdd-index.json`, which is **generated from
the feature files** by `scripts/ci/emit-bdd-index.mjs` and reconciled on every CI run by
`scripts/ci/check-bdd-runner.mjs` (the build fails if this page / the JSON drifts from the feature
files). Do not hand-edit the JSON; regenerate with `node scripts/ci/emit-bdd-index.mjs --json`.

See `docs/adr/20261110-gherkin-executable-runner.md` for why this exists (re-audit RP-G / BDD-1/2:
the scenarios were documentation with no executable runner).

## How to run

```bash
npm run test:bdd         # strict runner — the EXECUTABLE subset (not @pending, not @auth)
npm run test:bdd:all     # whole set incl. @pending — a worklist of undefined steps, not a gate
```

Strict mode means an **undefined or pending step is a hard failure** — a scenario that is not wired
to real code cannot pass.

## Status vocabulary

| Status | Meaning |
|---|---|
| `executable` | Every scenario is wired to step definitions and runs in the strict `test:bdd` gate. |
| `partial` | Some scenarios run; the rest are scenario-level `@pending` (tracked below). |
| `pending` | Committed spec; step definitions not yet wired. Excluded from the gate via `not @pending`, **never silently** — it is listed here and counted in the datastore. |
| `excluded-auth` | An auth feature. The auth refactor owns it; excluded from this runner via `not @auth`. |

## Audiences (declared enumeration)

Every feature maps to one or more audiences from this controlled vocabulary (enforced: a feature with
no audience mapping fails `check-bdd-runner`):

- **anonymous** — unauthenticated visitor (e.g. post-auth redirect validation).
- **authenticated** — a signed-in Tech Fleet member (chat, hand-off, uploads).
- **admin** — operator / admin actions (session revocation, admin tooling).
- **api-consumer** — an external system POSTing to a webhook (Resend delivery events).
- **partner** — a third-party surface the member reaches through (Discord, Figma).
- **internal** — platform-internal callers / shared library surface (`_shared/*`).

## Features

| Status | Exec / Total | Domain | Feature | Audiences |
|---|---|---|---|---|
| executable | 5 / 5 | _shared | [html-to-text](../supabase/functions/_shared/html-to-text.feature) | authenticated, internal |
| pending | 0 / 3 | _shared | [announcement-reach](../supabase/functions/_shared/email/announcement-reach.feature) | admin, internal |
| partial | 3 / 4 | _shared | [prompt-injection](../supabase/functions/_shared/prompt-injection.feature) | authenticated, internal |
| pending | 0 / 3 | _shared | [session-revocation](../supabase/functions/_shared/session-revocation.feature) | authenticated, admin |
| pending | 0 / 9 | _shared | [figma-extract](../supabase/functions/_shared/figma-extract.feature) | authenticated, partner |
| pending | 0 / 16 | discord-interactions | [fleety-2.1-discord](../supabase/functions/discord-interactions/fleety-2.1-discord.feature) | authenticated, partner |
| pending | 0 / 12 | fleety-extract | [fleety-2.2-f-uploads](../supabase/functions/fleety-extract/fleety-2.2-f-uploads.feature) | authenticated |
| pending | 0 / 5 | handoff-download | [handoff-download](../supabase/functions/handoff-download/handoff-download.feature) | authenticated |
| pending | 0 / 14 | handoff-produce | [handoff-produce](../supabase/functions/handoff-produce/handoff-produce.feature) | authenticated |
| pending | 0 / 12 | handoff-submit | [handoff-submit](../supabase/functions/handoff-submit/handoff-submit.feature) | authenticated |
| pending | 0 / 10 | resend-webhook | [resend-webhook](../supabase/functions/resend-webhook/resend-webhook.feature) | api-consumer, internal |
| pending | 0 / 13 | techfleet-chat | [fleety-modes](../supabase/functions/techfleet-chat/fleety-modes.feature) | authenticated |
| excluded-auth | 0 / 3 | auth | [auth-redirect](../src/features/auth/auth-redirect.feature) | anonymous, authenticated |

**Totals: 12 features, 106 scenario definitions — 8 executable, 98 pending/excluded.**

> Scenario-definition counts: a `Scenario Outline` counts as one definition here but the strict
> runner expands it per `Examples` row, so `prompt-injection` (3 executable definitions) runs as 10
> executed cases. The datastore counts definitions; the runner's report counts expanded cases.

## Pending backlog (tracked, not dropped)

The 98 pending scenarios are real committed specs awaiting step definitions. They need the Deno /
Supabase / live-upstream surface the pure `_shared` modules do not, so they are implemented behind
their own harness as the edge-function test surface grows. `npm run test:bdd:all` surfaces their
undefined steps on demand. Scenario-level pending today:

- `prompt-injection` → "A second prompt-injection implementation cannot be merged" asserts the
  single-owner **CI guard** (`check-single-prompt-injection-owner.mjs`), already proven by that
  guard's own smoke test; wiring it into cucumber (exec the guard) is backlog.
