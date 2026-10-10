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
  // Web search/crawl via the Firecrawl API (behind edgeFunctionBreaker; the raw invoke had no timeout).
  "firecrawl-search": 30_000,
  // ── Live Discord bot operations ────────────────────────────────────────────
  // Every function below makes live Discord API calls through `discordFetch`, whose
  // retry backoff can sleep up to 15s PER retry on a 429 — so the 8s default aborts
  // the client while the bot is still working (a false "it failed"). This is the
  // failure that broke the Discord-connect invite. `check-edge-timeout-coverage.mjs`
  // now REQUIRES every browser-invoked discordFetch function to be registered here,
  // so this class cannot silently recur.
  // Each function below is ALSO server-bounded via discordFetch({ totalBudgetMs }) at ~3s below its
  // client budget here (ADR-0063), so the server always finishes — success or clean failure —
  // before the browser aborts, even under sustained Discord 429s (backoff can sleep ~15s/retry).
  // Server-bounded to 12s via INVITE_TOTAL_BUDGET_MS; client sits just above it.
  "generate-discord-invite": 15_000,
  // Single guild role assign/remove/list per request; server-bounded to 12s (ROLES_TOTAL_BUDGET_MS).
  "manage-discord-roles": 15_000,
  // Re-reads one member's handle from Discord; server-bounded to 12s (REPAIR_TOTAL_BUDGET_MS).
  "repair-discord-username": 15_000,
  // Admin bulk repair: reads many members in one pass; server-bounded overall to 57s + 8s/item
  // (BACKFILL_TOTAL_BUDGET_MS / _PER_ITEM_BUDGET_MS), stops early and reports the unprocessed remainder.
  "backfill-discord-usernames": 60_000,
  // Fans out an applicant-status change to Discord + email; observed timing out at 8s. NOT yet
  // server-bounded here: its inline Discord calls are being removed by the ADR-0058/0059 fan-out
  // rework (notify becomes a write-only shim; Discord moves to process-applicant-workflow-events),
  // so the server bound is deferred to that branch to avoid bounding code it deletes (ADR-0063).
  "notify-applicant-status": 20_000,
  // Grants the observer role (2 sequential grants share 12s, OBSERVER_TOTAL_BUDGET_MS).
  "grant-observer-role": 15_000,
};

/**
 * The client timeout for an edge call: explicit override → registry → 8s default.
 * Kept as a pure function so it is trivially unit-testable and has one definition.
 */
export function resolveEdgeTimeoutMs(
  fn: string,
  explicitTimeoutMs: number | undefined,
  defaultTimeoutMs: number
): number {
  if (explicitTimeoutMs !== undefined) return explicitTimeoutMs;
  return EDGE_FUNCTION_TIMEOUTS_MS[fn] ?? defaultTimeoutMs;
}
