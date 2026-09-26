/**
 * Per-edge-function client timeout budgets (ms), keyed on the function name.
 *
 * WHY THIS EXISTS (structural fix, ADR-0028 / decisions.md §8):
 * `invokeEdge`'s 8s default is correct for interactive / DB-only calls, but the raw
 * `supabase.functions.invoke` it replaced had NO client timeout. Migrating a function
 * that does bulk work or a live upstream fetch WITHOUT thinking about the timeout
 * silently caps it at 8s — the client aborts with `TimeoutError` while the server keeps
 * running, producing a false failure on exactly the slow operation the code exists for.
 * This recurred five times during the Phase-1 burn-down (delete-account, replay-dlq-emails,
 * get-discord-member-count, gumroad-backfill, translate-bundle) — each caught in review and
 * patched at the call site. A per-call fix does not travel: the NEXT caller of the same
 * function re-inherits the 8s bug.
 *
 * The budget belongs to the FUNCTION, not the call site. Registering it here makes the
 * correct timeout attach to the function's identity, so EVERY call site — current and
 * future — inherits it automatically via `invokeEdge`. That makes the 8s-abort-of-a-
 * still-running-server failure structurally impossible for a registered function: you
 * cannot forget a timeout you never have to type.
 *
 * Precedence in invokeEdge: an explicit `invokeEdge({ timeoutMs })` wins (per-call
 * override); otherwise this registry; otherwise the 8s default. A function absent here
 * is asserting "8s is enough" — if that's wrong, the fix is to add it HERE (one line,
 * all callers), not at a call site.
 *
 * Invariant (enforced by edge-timeouts.test.ts): every key names a real
 * `supabase/functions/<name>/` and every value is a positive, finite ms budget, so the
 * registry cannot rot to a stale/typo'd name or an unbounded wait.
 */
export const EDGE_FUNCTION_TIMEOUTS_MS: Readonly<Record<string, number>> = {
  // Cascading account deletion (multi-table + auth user).
  "delete-account": 30_000,
  // Re-enqueues up to 500 DLQ emails sequentially, per template group.
  "replay-dlq-emails": 60_000,
  // Live Discord API fetch on the 24h refresh boundary (server budget is 8s → client must exceed it).
  "get-discord-member-count": 12_000,
  // Pages historical sales via the Gumroad API — "expensive + rate-limited".
  "gumroad-backfill": 30_000,
  // AI translation of a whole i18n namespace.
  "translate-bundle": 20_000,
};

/**
 * The client timeout for an edge call: explicit override → registry → 8s default.
 * Kept as a pure function so it is trivially unit-testable and has one definition.
 */
export function resolveEdgeTimeoutMs(
  fn: string,
  explicitTimeoutMs: number | undefined,
  defaultTimeoutMs: number,
): number {
  if (explicitTimeoutMs !== undefined) return explicitTimeoutMs;
  return EDGE_FUNCTION_TIMEOUTS_MS[fn] ?? defaultTimeoutMs;
}
