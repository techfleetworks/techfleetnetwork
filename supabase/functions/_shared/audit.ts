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

// ---- Isolate-local policy snapshot + per-event dedup/cap ----
interface PolicyEntry { capPerMinute: number; dedupWindowMs: number; }
const POLICY_TTL_MS = 5 * 60_000;
const DEFAULT_CAP = 30;
const DEFAULT_DEDUP_MS = 30_000;
const policy: { entries: Record<string, PolicyEntry>; pressure: "none"|"soft"|"medium"|"hard"; fetchedAt: number } = {
  entries: {}, pressure: "none", fetchedAt: 0,
};
const counters = new Map<string, { count: number; windowStart: number }>();
const recent = new Map<string, number>();
let policyInflight: Promise<void> | null = null;

function pressureMul(): number {
  switch (policy.pressure) {
    case "hard": return 0.1;
    case "medium": return 0.33;
    case "soft": return 0.66;
    default: return 1;
  }
}

async function refreshPolicy(client: SupabaseClient): Promise<void> {
  if (Date.now() - policy.fetchedAt < POLICY_TTL_MS) return;
  if (policyInflight) return policyInflight;
  policyInflight = (async () => {
    try {
      const [{ data: rows }, { data: health }] = await Promise.all([
        client.rpc("get_audit_policy"),
        client.from("system_health_state").select("metadata").eq("id", 1).maybeSingle(),
      ]);
      const entries: Record<string, PolicyEntry> = {};
      if (Array.isArray(rows)) {
        for (const r of rows as Array<{ event_type_pattern: string; cap_per_minute: number; dedup_window_seconds: number }>) {
          entries[r.event_type_pattern] = { capPerMinute: r.cap_per_minute, dedupWindowMs: r.dedup_window_seconds * 1000 };
        }
      }
      const meta = (health?.metadata ?? {}) as { audit_pressure?: typeof policy.pressure };
      policy.entries = entries;
      policy.pressure = meta.audit_pressure ?? "none";
      policy.fetchedAt = Date.now();
    } catch {
      policy.fetchedAt = Date.now();
    } finally {
      policyInflight = null;
    }
  })();
  return policyInflight;
}

function shouldEmit(eventType: string, fingerprint: string): boolean {
  const e = policy.entries[eventType];
  const cap = Math.max(1, Math.floor((e?.capPerMinute ?? DEFAULT_CAP) * pressureMul()));
  const dedupMs = e?.dedupWindowMs ?? DEFAULT_DEDUP_MS;
  const now = Date.now();
  const last = recent.get(fingerprint);
  if (last && now - last < dedupMs) return false;
  recent.set(fingerprint, now);
  if (recent.size > 500) {
    const cutoff = now - dedupMs;
    for (const [k, ts] of recent) if (ts < cutoff) recent.delete(k);
  }
  let bucket = counters.get(eventType);
  if (!bucket || now - bucket.windowStart > 60_000) {
    bucket = { count: 0, windowStart: now };
    counters.set(eventType, bucket);
  }
  if (bucket.count >= cap) return false;
  bucket.count++;
  return true;
}

export async function auditEdgeEvent(
  client: SupabaseClient,
  args: AuditEdgeEventArgs,
): Promise<void> {
  try {
    // Best-effort policy refresh. Stale snapshot is fine; never blocks.
    void refreshPolicy(client);

    // Apply per-event cap + dedup (skip for known-low-volume security events).
    const fp = `${args.event}::${SAFE(args.fn)}::${(args.errorMessage ?? args.recordId ?? "").slice(0, 200)}`;
    if (!shouldEmit(args.event, fp)) return;

    const fields = [
      `source:edge.${SAFE(args.fn)}`,
      `severity:${args.severity ?? "error"}`,
    ];
    if (args.traceId) fields.push(`trace:${SAFE(args.traceId)}`);
    if (policy.pressure !== "none") fields.push(`pressure:${policy.pressure}`);
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
