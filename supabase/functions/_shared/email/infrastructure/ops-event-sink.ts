import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { EventSink } from "../ports.ts";

// Telemetry sink for the email-v2 pipeline. Writes go through `record_event` —
// the single write path for ops_events (SECURITY DEFINER, service-role) — NOT a
// direct PostgREST table insert. A direct insert bypasses the RPC and drifts from
// the table shape: ops_events has no `source` column, so sending a top-level
// `source` made PostgREST reject every row (PGRST204 → HTTP 400) and the telemetry
// was silently dropped. `source` is event metadata, so it rides in the payload;
// occurred_at is the table's now() default (rows are inserted inline). See ADR-0060.
export function makeOpsEventSink(supabase: SupabaseClient, source = "email-v2"): EventSink {
  return {
    async emit(kind, payload, severity = "info") {
      try {
        const { error } = await supabase.rpc("record_event", {
          p_sink: "ops_events",
          p_kind: kind,
          p_severity: severity,
          p_payload: { ...payload, source },
        });
        if (error) console.warn("ops_events emit failed", { kind, err: error.message });
      } catch (e) {
        console.warn("ops_events emit failed", { kind, err: String(e) });
      }
    },
  };
}
