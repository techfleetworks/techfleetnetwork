// Module: supabase/functions/_shared/email/announcement-batch-enqueue (bdd-gate coverage marker)
// The full audience is enqueued in bounded slices so no statement can time out.
// These tests pin the loop contract: it drains across batches, advances the cursor,
// totals eligible/enqueued, stops on error, terminates on a short slice, and cannot
// spin forever. Spec: announcement-batch-enqueue.feature.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  enqueueAnnouncementInBatches,
  MAX_BATCHES,
  type BatchEnqueuer,
} from "./announcement-batch-enqueue.ts";

type Row = { last_email: string | null; considered: number; inserted: number; effective_batch?: number };
type Call = { args: Record<string, unknown> };

/** A fake rpc that returns scripted batch rows and records the args it was called with. */
function scriptedEnqueuer(
  rows: Array<Row | { error: unknown }>,
): { client: BatchEnqueuer; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  return {
    calls,
    client: {
      rpc: (_fn, args) => {
        calls.push({ args });
        const next = rows[i++] ?? { last_email: null, considered: 0, inserted: 0 };
        if ("error" in next) return Promise.resolve({ data: null, error: next.error });
        return Promise.resolve({ data: [next], error: null });
      },
    },
  };
}

Deno.test("drains the whole audience across batches and totals the counts", async () => {
  // Two full slices of 500, then a short slice of 120 → audience 1120.
  const { client, calls } = scriptedEnqueuer([
    { last_email: "e0500", considered: 500, inserted: 500 },
    { last_email: "e1000", considered: 500, inserted: 500 },
    { last_email: "e1120", considered: 120, inserted: 120 },
  ]);
  const res = await enqueueAnnouncementInBatches(client, {
    announcementId: "a1", subject: "s", html: "<p>h</p>", text: "t",
  });
  assertEquals(res.error, null);
  assertEquals(res.eligible, 1120);
  assertEquals(res.enqueued, 1120);
  assertEquals(res.batches, 3);
  // Cursor advances: first call empty, then the prior slice's last_email.
  assertEquals(calls[0].args.p_after_email, "");
  assertEquals(calls[1].args.p_after_email, "e0500");
  assertEquals(calls[2].args.p_after_email, "e1000");
});

Deno.test("stops and surfaces the error, keeping progress so far", async () => {
  const { client } = scriptedEnqueuer([
    { last_email: "e0500", considered: 500, inserted: 500 },
    { error: { message: "statement timeout" } },
  ]);
  const res = await enqueueAnnouncementInBatches(client, {
    announcementId: "a1", subject: "s", html: "h", text: "t",
  });
  assert(res.error !== null, "error must be surfaced");
  assertEquals(res.enqueued, 500); // the committed first batch is reported
  assertEquals(res.batches, 2);
});

Deno.test("an idempotent re-run (considered full, inserted 0) still terminates", async () => {
  const { client } = scriptedEnqueuer([
    { last_email: "e0500", considered: 500, inserted: 0 },
    { last_email: "e0600", considered: 100, inserted: 0 },
  ]);
  const res = await enqueueAnnouncementInBatches(client, {
    announcementId: "a1", subject: "s", html: "h", text: "t",
  });
  assertEquals(res.error, null);
  assertEquals(res.eligible, 600);
  assertEquals(res.enqueued, 0);
  assertEquals(res.batches, 2);
});

Deno.test("empty audience → one call, zero everything", async () => {
  const { client } = scriptedEnqueuer([{ last_email: null, considered: 0, inserted: 0 }]);
  const res = await enqueueAnnouncementInBatches(client, {
    announcementId: "a1", subject: "s", html: "h", text: "t",
  });
  assertEquals(res.eligible, 0);
  assertEquals(res.enqueued, 0);
  assertEquals(res.batches, 1);
});

Deno.test("end-detection uses the DB's clamped batch size, not the requested one", async () => {
  // Driver requests 5000; the DB clamps to 2000 and reports effective_batch=2000.
  // A full 2000 slice must NOT be read as the end just because 2000 < 5000 — doing
  // so would silently drop everyone past the first 2000 (the trap judge-arch flagged).
  const { client } = scriptedEnqueuer([
    { last_email: "e2000", considered: 2000, inserted: 2000, effective_batch: 2000 },
    { last_email: "e2500", considered: 500, inserted: 500, effective_batch: 2000 },
  ]);
  const res = await enqueueAnnouncementInBatches(client, {
    announcementId: "a1", subject: "s", html: "h", text: "t", batchSize: 5000,
  });
  assertEquals(res.error, null);
  assertEquals(res.eligible, 2500); // continued past the clamped-full first slice
  assertEquals(res.enqueued, 2500);
  assertEquals(res.batches, 2);
});

Deno.test("a full slice with no cursor cannot loop forever", async () => {
  // Pathological: always a full slice but no last_email. Must stop, not spin.
  const alwaysFull: BatchEnqueuer = {
    rpc: () => Promise.resolve({ data: [{ last_email: null, considered: 500, inserted: 0 }], error: null }),
  };
  const res = await enqueueAnnouncementInBatches(alwaysFull, {
    announcementId: "a1", subject: "s", html: "h", text: "t",
  });
  assert(res.batches <= MAX_BATCHES, "must be bounded by MAX_BATCHES");
  assertEquals(res.batches, 1); // defensive break on missing cursor
});
