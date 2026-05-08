/**
 * safeRpc — wraps `supabase.rpc(...)` so that returned `{ error }` payloads
 * (which are otherwise easy to ignore) are reported to the triage pipeline.
 *
 * Behaviour matches the underlying call: returns `{ data, error }`. The
 * caller can still branch on the result; we just guarantee the error is
 * never silent in System Health.
 */
import { supabase } from "@/integrations/supabase/client";
import { reportError } from "@/services/error-reporter.service";

type RpcArgs = Record<string, unknown> | undefined;

export async function safeRpc<T = unknown>(
  rpcName: string,
  args?: RpcArgs,
  opts: { source?: string; severity?: "warn" | "error" } = {},
): Promise<{ data: T | null; error: { message: string } | null }> {
  const source = opts.source ?? `rpc.${rpcName}`;
  const severity = opts.severity ?? "error";
  try {
    // The Supabase JS client's `rpc` overloads are strict; a runtime cast is
    // safer than fighting generics here.
    const { data, error } = await (supabase.rpc as unknown as (
      n: string,
      a?: RpcArgs,
    ) => Promise<{ data: T | null; error: { message: string } | null }>)(
      rpcName,
      args,
    );
    if (error) {
      reportError(`${rpcName}: ${error.message}`, source, {
        eventType: "rpc_failed",
        severity,
      });
    }
    return { data, error };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportError(err, source, { eventType: "rpc_failed", severity });
    return { data: null, error: { message } };
  }
}
