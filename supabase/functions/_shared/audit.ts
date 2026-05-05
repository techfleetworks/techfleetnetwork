/**
 * Edge Function audit + middleware helpers.
 *
 * - `auditEdgeEvent` writes a row to `public.audit_log` via the
 *   `write_audit_log` RPC under the service role (RLS bypass).
 * - `withAuditWrapper` wraps a handler so that:
 *     1. an `x-trace-id` is always present (read from request, otherwise
 *        generated and threaded into the response),
 *     2. uncaught throws emit `edge_function_error` and return JSON 500,
 *     3. the trace id is mirrored on every audit row this fn emits.
 *
 * Telemetry must NEVER throw or break the user flow.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getAdminClient } from "./admin-client.ts";
import { jsonResponse } from "./http.ts";

export type AuditSeverity = "info" | "warn" | "error";

export interface AuditEdgeEventArgs {
  fn: string;
  event: string;
  table?: string;
  recordId?: string | null;
  userId?: string | null;
  traceId?: string | null;
  severity?: AuditSeverity;
  fields?: string[];
  errorMessage?: string;
}

const SAFE = (raw: string) => raw.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 100);

export async function auditEdgeEvent(
  client: SupabaseClient,
  args: AuditEdgeEventArgs,
): Promise<void> {
  try {
    const fields = [
      `source:edge.${SAFE(args.fn)}`,
      `severity:${args.severity ?? "error"}`,
    ];
    if (args.traceId) fields.push(`trace:${SAFE(args.traceId)}`);
    for (const f of args.fields ?? []) {
      if (f.length <= 100 && /^[A-Za-z0-9_.:-]+$/.test(f)) fields.push(f);
    }
    await client.rpc("write_audit_log", {
      p_event_type: args.event,
      p_table_name: args.table ?? "edge_function",
      p_record_id: (args.recordId ?? args.fn).slice(0, 200),
      p_user_id: args.userId ?? null,
      p_changed_fields: fields.slice(0, 50),
      p_error_message: args.errorMessage?.slice(0, 1000) ?? null,
    });
  } catch (_err) {
    // Telemetry must never break the function.
  }
}

export interface AuditedRequestContext {
  traceId: string;
  fn: string;
}

function newTraceId(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getOrCreateTraceId(req: Request): string {
  const incoming = req.headers.get("x-trace-id");
  if (incoming && /^[A-Za-z0-9_-]{4,64}$/.test(incoming)) return incoming;
  return newTraceId();
}

/**
 * Wraps an edge function handler with structured error auditing + trace
 * propagation. Use as:
 *
 *   Deno.serve(withAuditWrapper("my-fn", async (req, ctx) => { ... }));
 */
export function withAuditWrapper(
  fnName: string,
  handler: (req: Request, ctx: AuditedRequestContext) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const traceId = getOrCreateTraceId(req);
    const ctx: AuditedRequestContext = { traceId, fn: fnName };
    try {
      const res = await handler(req, ctx);
      // Mirror trace id on the response so the caller can correlate.
      try {
        res.headers.set("x-trace-id", traceId);
      } catch {
        // Some Response objects have immutable headers — ignore.
      }
      return res;
    } catch (err) {
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      void auditEdgeEvent(getAdminClient(), {
        fn: fnName,
        event: "edge_function_error",
        table: "edge_function",
        traceId,
        severity: "error",
        errorMessage: message,
      });
      const res = jsonResponse({ error: "Internal server error", traceId }, 500);
      try { res.headers.set("x-trace-id", traceId); } catch { /* noop */ }
      return res;
    }
  };
}
