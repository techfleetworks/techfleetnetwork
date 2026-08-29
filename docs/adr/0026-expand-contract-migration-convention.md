# ADR 0026 — Expand/contract is the required convention for all schema migrations

- Status: Accepted
- Date: 2026-08-28
- Deciders: TechFleet (owner)
- Related: ADR-0020 (migrations-applied verification gate); ADR-0024 (prove invariants at the owning layer / pgTAP); `supabase/migrations/CLAUDE.md`; `decisions.md`; the hardening plan's **Phase 0d** (infra prerequisites) and **Phase 3** (single-writer ownership migrations).

## Context

TFN's DB migrations are **hand-applied** (`supabase db push`) and **forward-only**, while the frontend and edge functions **auto-deploy on merge**. A `db push` is therefore _not_ atomic with a code deploy, and ADR-0020's gate confirms only that committed migrations _are applied_ — not that they applied _safely alongside running code_. Two windows are unavoidable:

1. A migration can be live on prod **while the previous app code is still running** (migration applied, deploy not yet finished, or a human ran `db push` ahead of merge).
2. A migration stays applied if the code that needed it is **rolled back**.

An in-place destructive change (rename/drop a column, add `NOT NULL`, change a type, drop an RPC) breaks the app the instant it applies against still-running old code — exactly the class of self-inflicted outage the audit flagged, and a direct risk for **Phase 3**, which moves mirrored values to a single owner (a change that touches both writers and readers of a fact).

There was no written convention for this: `decisions.md` had no migration guidance and `supabase/migrations/` had no scoped `CLAUDE.md`. Phase 0d ("confirm or build an expand/contract migration convention") was the gap. The feature-flag half of 0d already exists (`src/services/feature-flags.service.ts`); this ADR closes the schema half.

## Decision

**Every schema migration follows expand/contract, enforced by convention documented where migrations are written (`supabase/migrations/CLAUDE.md`) and referenced from `decisions.md`.**

- **Expand** (additive: nullable column, new table/index/function, new enum value, backfill) ships **first** and never removes or tightens anything.
- **Contract** (drop/rename/tighten/remove) lands in a **later** migration, only after every code path has stopped using the old shape and the expand migration is verified applied (ADR-0020).
- The banned in-place operations, with ✅ replacements, are enumerated with copy-paste examples in `supabase/migrations/CLAUDE.md` (rename → add+backfill+dual-write+switch+drop; `NOT NULL` → nullable+backfill+later-constrain; type change and function-signature change treated as contract).
- Migrations are idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`) so the migration-smoke gate can re-apply from scratch; RLS/trigger/`SECURITY DEFINER` changes are proven with pgTAP in the `db-test` job (ADR-0024).
- **Phase 3 single-writer ownership changes MUST use it** — expand (new owning column/table + backfill + dual-write) then contract (drop the mirror), never a single cut-over.

## Considered options

- **(chosen) Written expand/contract convention (scoped CLAUDE.md + ADR + decisions.md pointer).** Right-sized, lands immediately, and sits exactly where an agent/teammate writing a migration will read it. Consistent with how the arch gate was adopted (ADR-0019 + decisions.md + AGENTS.md).
- **A mechanical gate that rejects unsafe migrations (e.g. flag a `DROP COLUMN` / in-place `RENAME`).** Deferred, not rejected: reliably detecting an _unsafe_ drop vs a legitimate contract requires cross-migration reasoning (was there a prior expand? have all callers migrated?) that a single-file scan can't do without high false positives. Recorded as a future `arch-encode` follow-up; the convention + judge-arch review cover it until then.
- **Rely on ADR-0020 alone.** Rejected — that gate proves a migration _reached_ prod, not that it was _safe to apply while old code ran_. The outage window is a different failure than the one ADR-0020 closes.
- **Make deploys atomic with `db push`.** Out of scope / not available in the current hosting model; expand/contract is the standard answer precisely because deploys are never perfectly atomic.

## Consequences

- **Positive:** a migration can no longer take prod down by racing a deploy; Phase 3's ownership migrations have a safe, prescribed shape; the rule lives where the code lives, so it is applied by default, not remembered. Rollbacks are safe because expand migrations are backward-compatible by construction.
- **Negative / trade-offs:** destructive cleanups now take **two** migrations (and often an intervening deploy), so schema tidy-ups are slower and a repo can carry a transient "expanded but not yet contracted" state (an extra nullable column, a dual-write). That is the accepted cost of never breaking running code. The convention is convention-enforced (plus judge-arch) until a mechanical gate is warranted.

## Confirmation

`supabase/migrations/CLAUDE.md` states the rule with ❌/✅ examples and loads whenever an agent works in `supabase/migrations/`; `decisions.md` points to it; every migration PR is reviewed against it (judge-arch) and its idempotency is exercised by the migration-smoke gate. Phase 3 ownership PRs cite this ADR.
