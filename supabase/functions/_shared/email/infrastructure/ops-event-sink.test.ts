// Regression proof for the ops_events telemetry 400-drop.
//
// The sink used to `.from('ops_events').insert({ kind, severity, source, ... })`
// — but ops_events has NO `source` column, so PostgREST rejected every row with
// PGRST204 (HTTP 400) and the email-v2 telemetry was silently dropped. These
// tests fail against that old shape and pass once the sink routes through the
// canonical `record_event` RPC with `source` folded into the payload.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { makeOpsEventSink } from "./ops-event-sink.ts";

// The insertable columns of public.ops_events (base migration 20260602230329;
// mirrored by src/integrations/supabase/types.ts). `source` is deliberately absent.
const OPS_EVENTS_COLUMNS = new Set([
  "id",
  "event_day",
  "occurred_at",
  "kind",
  "severity",
  "actor_id",
  "ref_table",
  "ref_id",
  "payload",
  "expires_at",
]);

interface RpcCall {
  fn: string;
  params: Record<string, unknown>;
}
interface InsertCall {
  table: string;
  rows: Record<string, unknown>;
}

function makeFakeClient(opts: { rpcError?: { message: string }; throwOnRpc?: boolean } = {}) {
  const rpc: RpcCall[] = [];
  const inserts: InsertCall[] = [];
  const client = {
    rpc(fn: string, params: Record<string, unknown>) {
      rpc.push({ fn, params });
      if (opts.throwOnRpc) throw new Error("network down");
      return Promise.resolve({ data: null, error: opts.rpcError ?? null });
    },
    from(table: string) {
      return {
        insert(rows: Record<string, unknown>) {
          inserts.push({ table, rows });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, rpc, inserts };
}

function captureWarnings(): { warnings: unknown[][]; restore: () => void } {
  const warnings: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  return {
    warnings,
    restore: () => {
      console.warn = original;
    },
  };
}

Deno.test(
  "emit routes through the record_event RPC (single write path), not a direct ops_events insert",
  async () => {
    const { client, rpc, inserts } = makeFakeClient();
    const sink = makeOpsEventSink(client);

    await sink.emit("email.enqueued", { template: "welcome", lane: "transactional" }, "info");

    assertEquals(inserts.length, 0, "must not touch ops_events via a direct PostgREST insert");
    assertEquals(rpc.length, 1);
    assertEquals(rpc[0].fn, "record_event");
    assertEquals(rpc[0].params.p_sink, "ops_events");
    assertEquals(rpc[0].params.p_kind, "email.enqueued");
    assertEquals(rpc[0].params.p_severity, "info");
  }
);

Deno.test(
  "emit folds `source` into the payload — never a top-level column (the PGRST204 root cause)",
  async () => {
    const { client, rpc } = makeFakeClient();
    const sink = makeOpsEventSink(client);

    await sink.emit("email.attempt.sent", { outbox_id: 42, lane: "bulk" }, "info");

    const payload = rpc[0].params.p_payload as Record<string, unknown>;
    assertEquals(payload, { outbox_id: 42, lane: "bulk", source: "email-v2" });

    // No argument the sink sends may name a column outside the ops_events schema.
    // `source` must live inside p_payload (JSONB), not as its own field.
    const topLevelFields = Object.keys(rpc[0].params)
      .filter((k) => k.startsWith("p_"))
      .map((k) => k.slice(2))
      .filter((col) => col !== "sink" && col !== "payload");
    for (const col of topLevelFields) {
      assert(
        OPS_EVENTS_COLUMNS.has(col),
        `record_event arg p_${col} maps to a real ops_events column`
      );
    }
    assert(!("source" in rpc[0].params), "source must not be a top-level record_event argument");
  }
);

Deno.test("a custom source is honoured and still rides in the payload", async () => {
  const { client, rpc } = makeFakeClient();
  const sink = makeOpsEventSink(client, "reconciler");

  await sink.emit("email.expired", { message_id: "m1" }, "warn");

  assertEquals(rpc[0].params.p_payload, { message_id: "m1", source: "reconciler" });
  assertEquals(rpc[0].params.p_severity, "warn");
});

Deno.test("a returned RPC error is reported, not swallowed silently", async () => {
  const { client } = makeFakeClient({ rpcError: { message: "permission denied" } });
  const cap = captureWarnings();
  try {
    const sink = makeOpsEventSink(client);
    await sink.emit("email.enqueued", {}, "info"); // must resolve, never reject
    assertEquals(cap.warnings.length, 1, "an RPC error must surface a warning in the edge logs");
    assertEquals(cap.warnings[0][0], "ops_events emit failed");
  } finally {
    cap.restore();
  }
});

Deno.test("emit is fire-and-forget — a thrown client error never breaks the caller", async () => {
  const { client } = makeFakeClient({ throwOnRpc: true });
  const cap = captureWarnings();
  try {
    const sink = makeOpsEventSink(client);
    await sink.emit("email.enqueued", {}, "info"); // resolves despite the throw
    assertEquals(cap.warnings.length, 1);
  } finally {
    cap.restore();
  }
});
