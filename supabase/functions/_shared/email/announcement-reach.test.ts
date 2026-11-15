// Module: supabase/functions/_shared/email/announcement-reach (bdd-gate coverage marker)
// A failed announcement broadcast must page through the audit sink, never die
// silently. These tests pin the alert contract: the stable event_type, the
// de-noise fingerprint tags, and best-effort emission that cannot throw.
// Spec: announcement-reach.feature.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ANNOUNCEMENT_REACH_FAILED_EVENT,
  buildReachAlertTags,
  emitAnnouncementReachAlert,
  type AuditWriter,
} from "./announcement-reach.ts";

type Call = { fn: string; args: Record<string, unknown> };

function recorder(result: { error: unknown } = { error: null }): { client: AuditWriter; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    client: {
      rpc: (fn, args) => {
        calls.push({ fn, args });
        return Promise.resolve(result);
      },
    },
  };
}

Deno.test("tags carry reason and, when known, counts (de-noise fingerprint)", () => {
  assertEquals(
    buildReachAlertTags({ announcementId: "a1", reason: "zero_reach", detail: "x", eligible: 2279, enqueued: 0 }),
    ["reason:zero_reach", "eligible:2279", "enqueued:0"],
  );
  // Counts are omitted when unknown (e.g. an enqueue error rolled back before a count existed).
  assertEquals(
    buildReachAlertTags({ announcementId: "a1", reason: "enqueue_failed", detail: "x" }),
    ["reason:enqueue_failed"],
  );
});

Deno.test("emit writes one write_audit_log row with the stable event_type and null actor", async () => {
  const { client, calls } = recorder();
  await emitAnnouncementReachAlert(client, {
    announcementId: "ann-500a97b5",
    reason: "enqueue_failed",
    detail: "enqueue cancelled by statement_timeout, rolled back",
  });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].fn, "write_audit_log");
  assertEquals(calls[0].args.p_event_type, ANNOUNCEMENT_REACH_FAILED_EVENT);
  assertEquals(calls[0].args.p_table_name, "announcements");
  assertEquals(calls[0].args.p_record_id, "ann-500a97b5");
  assertEquals(calls[0].args.p_user_id, null); // service-role write — nil-UUID is rejected
  assert(Array.isArray(calls[0].args.p_changed_fields));
});

Deno.test("p_error_message is truncated to 1000 chars", async () => {
  const { client, calls } = recorder();
  await emitAnnouncementReachAlert(client, {
    announcementId: "a1",
    reason: "enqueue_failed",
    detail: "x".repeat(5000),
  });
  assertEquals((calls[0].args.p_error_message as string).length, 1000);
});

Deno.test("a failing audit write is swallowed — alerting never breaks the caller", async () => {
  const { client } = recorder({ error: { message: "audit sink down" } });
  // Must resolve, not reject.
  await emitAnnouncementReachAlert(client, { announcementId: "a1", reason: "enqueue_failed", detail: "x" });
});

Deno.test("a throwing client is swallowed — emission is best-effort", async () => {
  const client: AuditWriter = {
    rpc: () => {
      throw new Error("network");
    },
  };
  await emitAnnouncementReachAlert(client, { announcementId: "a1", reason: "enqueue_failed", detail: "x" });
});
