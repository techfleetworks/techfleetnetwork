# invokeEdge calls carry a validated request/response contract

- Status: Accepted
- Date: 2026-11-10
- Relates to: re-audit 2026-10-30 findings **ARCH-2 / ARCH-4** (RP-J); [decisions.md §4](../../decisions.md) ("Every failure reports"), [decisions.md §6](../../decisions.md) ("Gate integrity"); ADR-0028 (invokeEdge timeout registry)

## Context

Every client→edge call goes through `invokeEdge` (`src/lib/edge/invokeEdge.ts`), enforced by the
`no-raw-functions-invoke` ESLint rule. The helper already *supports* optional Zod `bodySchema` /
`responseSchema` params and already fails loudly on a mismatch (throws `EdgeInvokeError`, reports
through the observability sink — never swallows). But at the time of the 2026-10-30 re-audit **zero**
of the ~43 call sites passed one.

The consequence (ARCH-2 / ARCH-4): the frontend and an edge function agree on a request/response
shape only by convention. When either side changes a field — a renamed key, a dropped property, a
type change — nothing catches it. The bad shape flows through as `unknown`-cast data and surfaces far
away as an undefined read or a silent wrong value. There was no contract test and no CI signal.

Two forces shape the fix:

1. The helper is the single owner of the call path — the validation belongs there, not duplicated at
   call sites (it already is). The missing half is **adoption** plus **enforcement**.
2. ~43 call sites cannot all be converted safely in one change (each needs the real server shape, and
   a too-strict `responseSchema` would red *valid* production traffic). So adoption must be a
   **ratchet**, not a big-bang: a backlog that can only shrink, proven in CI.

Auth sign-in / account-setup callers are **out of scope** — a separate refactor owns them and routes
through `sessionPort` (a different API). They are excluded from both the batch and the guard.

## Decision

1. **Keep the one owner.** `invokeEdge` stays the sole validator: `bodySchema` runs before send
   (throws `EdgeInvokeError` status 400, caller handles — the bad request never reaches the network);
   `responseSchema` runs after receive (throws status 502 and **reports**). No call site re-implements
   validation. The helper is unchanged by this ADR beyond already doing this.

2. **Adopt a first coherent batch.** The hand-off subsystem (`src/services/handoff.service.ts`, 5 call
   sites across `handoff-submit` / `handoff-produce` / `handoff-download`) now passes schemas. The
   result types `ProduceResult` and `DownloadLink` are **inferred from their response schemas**
   (`z.infer`), so the TypeScript type and the runtime check share one source and cannot drift. Body
   schemas mirror the edge functions; response schemas use `.passthrough()` and assert only the fields
   the client reads, so a server adding a field never reds a valid response. `submitFile` carries the
   response schema but no body schema (its body is multipart, not a JSON object Zod can parse).

   **Adopted: 5 / ~43. Remaining non-auth backlog: 38** (pinned in the snapshot below). This is an
   honest partial — the rest is a tracked follow-up, not a claim of completion.

3. **Enforce by construction with a per-count ratchet.**
   `scripts/ci/check-invokeedge-schema-adoption.mjs` (`// ci-lane: critical`, blocking) scans `src/`,
   counts the schema-less `invokeEdge` call sites per file, and compares the count to
   `invokeedge-schema-adoption.snapshot.json`. A count **above** the snapshot fails (a new schema-less
   caller, or an existing one that dropped its schema). A count **below** the snapshot also fails as
   **stale** (the backlog shrank but the committed number was not tightened). "Can only shrink" is
   enforced mechanically at both ends: CI (verify) reds a risen per-file count, and `--update` itself
   **refuses to raise** the backlog total — a new schema-less caller cannot be waved green by
   regenerating the snapshot; it must carry a schema (a deliberate, reviewed increase needs the explicit
   `--allow-increase` flag, visible in the diff). It fails closed on a missing snapshot or a zero-file
   scan (decisions.md §6) and auto-wires into the `lint-arch-critical` matrix via `emit-guard-matrix`
   (ADR-0047) — no hand-edit of `ci.yml`.

4. **Prove the enforcement.** Two discrimination layers:
   - `src/test/lib/invokeEdge.test.ts` reds if the helper's `bodySchema` or `responseSchema` block is
     deleted (bad response → throws + reports; bad body → throws before send; good shapes pass).
   - `src/test/smoke/check-invokeedge-schema-adoption.smoke.test.ts` runs the real guard against
     fixtures and asserts it reds on a new schema-less caller, reds on a stale snapshot, and fails
     closed — satisfying the guard-has-test / discrimination discipline (ADR-0022 / ADR-0023).

## Consequences

- A frontend↔edge shape drift on an adopted call now fails loudly (a thrown, reported
  `EdgeInvokeError`) instead of silently; the contract tests keep it that way.
- New `invokeEdge` callers must carry a schema or be added to the shrinking backlog deliberately —
  there is no silent default anymore.
- The batch is partial by design. Converting the remaining 38 is mechanical but per-call (each needs
  the real server shape); do it in further batches, each shrinking the snapshot via
  `node scripts/ci/check-invokeedge-schema-adoption.mjs --update`.

## Follow-ups (explicitly out of this change)

- **Convert the remaining 38 non-auth call sites** in coherent batches (Discord, policies, Gumroad,
  explore, announcements, confirm/DSAR pages, system-health). Tracked by the snapshot.
- **Auth callers** — owned by the auth refactor; convert when that work routes them through a port.
- **Arch-gate waivers: per-count, fail-on-stale.** The RP-J audit also bundled reshaping
  `arch-gate.waivers.json` from per-file entries to a per-count model that fails on stale/expired
  waivers. That file is ~2137 lines and is edited by many concurrent hardening branches, so changing
  its model here would be a large, high-collision change orthogonal to the invokeEdge contract. It is
  **split into a separate follow-up** rather than half-done in this PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
