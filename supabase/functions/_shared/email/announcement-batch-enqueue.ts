// Drives the bounded, cursor-advanced announcement enqueue (PR2).
//
// Instead of one unbounded set-based INSERT (which the 8s statement_timeout cancels
// and rolls back — the 2026-11-12 incident), the full audience is enqueued in
// batches of <= batchSize rows. Each call to enqueue_announcement_batch touches at
// most batchSize rows, so no statement can time out regardless of audience size
// (invariant I1). The loop advances a cursor (the last email of the previous slice)
// until a short slice signals the end. A crash mid-loop leaves committed batches in
// place; a re-run is idempotent (unique idempotency_key) and resumes without
// double-sending.
//
// Kept out of the handler so it is unit-testable with a fake rpc (no Deno/Supabase).

export interface BatchEnqueuer {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
}

export interface BatchEnqueueResult {
  /** Total recipients considered across all slices = the eligible audience size. */
  eligible: number;
  /** Newly enqueued rows (ON CONFLICT re-drives only prior 'expired'; re-runs add 0). */
  enqueued: number;
  /** Number of batch calls made (observability; also bounds the loop). */
  batches: number;
  /** The rpc error that stopped the loop, or null on a complete drain. */
  error: unknown | null;
}

// Upper bound on batch calls per invocation so a bug (or a pathological cursor)
// can never spin forever inside the edge runtime. 400 * 500 = 200k recipients,
// far above the real audience; a larger audience simply resumes on the next run.
export const MAX_BATCHES = 400;
export const DEFAULT_BATCH_SIZE = 500;

interface BatchRow {
  last_email?: string | null;
  considered?: number;
  inserted?: number;
  /** The size the DB actually used after clamping; the authority for end-detection. */
  effective_batch?: number;
}

export async function enqueueAnnouncementInBatches(
  client: BatchEnqueuer,
  args: {
    announcementId: string;
    subject: string;
    html: string;
    text: string;
    batchSize?: number;
  },
): Promise<BatchEnqueueResult> {
  const batchSize = args.batchSize ?? DEFAULT_BATCH_SIZE;
  let cursor = "";
  let eligible = 0;
  let enqueued = 0;
  let batches = 0;

  while (batches < MAX_BATCHES) {
    const { data, error } = await client.rpc("enqueue_announcement_batch", {
      p_announcement_id: args.announcementId,
      p_subject: args.subject,
      p_html: args.html,
      p_text: args.text,
      p_after_email: cursor,
      p_batch_size: batchSize,
    });
    batches++;

    if (error) return { eligible, enqueued, batches, error };

    const row = (Array.isArray(data) ? data[0] : data) as BatchRow | null | undefined;
    const considered = Number(row?.considered ?? 0);
    const inserted = Number(row?.inserted ?? 0);
    eligible += considered;
    enqueued += inserted;

    // End-of-audience is a slice shorter than the size the DB ACTUALLY used (which
    // may be clamped below what we requested). Comparing against the requested size
    // instead would stop early when the clamp bites — a silent under-enqueue.
    const effective = Number(row?.effective_batch ?? batchSize);
    if (considered < effective) break;

    const next = String(row?.last_email ?? "");
    // Defensive: a full slice with no cursor would loop forever — stop instead.
    if (!next || next === cursor) break;
    cursor = next;
  }

  return { eligible, enqueued, batches, error: null };
}
