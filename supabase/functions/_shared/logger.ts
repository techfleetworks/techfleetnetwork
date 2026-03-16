/**
 * Shared structured logger for Supabase Edge Functions.
 *
 * Outputs JSON-structured log lines so they are easy to search
 * and filter in the edge function logs viewer.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  fn: string;
  action: string;
  msg: string;
  ts: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

function formatError(err: unknown): LogEntry["error"] | undefined {
  if (!err) return undefined;
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { name: "UnknownError", message: String(err) };
}

function emit(entry: LogEntry) {
  const line = JSON.stringify(entry);
  switch (entry.level) {
    case "debug":
    case "info":
      console.log(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "error":
      console.error(line);
      break;
  }
}

export function createEdgeLogger(fnName: string) {
  const make = (
    level: LogLevel,
    action: string,
    msg: string,
    meta?: Record<string, unknown>,
    err?: unknown
  ): LogEntry => ({
    level,
    fn: fnName,
    action,
    msg,
    ts: new Date().toISOString(),
    meta,
    error: formatError(err),
  });

  return {
    debug(action: string, msg: string, meta?: Record<string, unknown>) {
      emit(make("debug", action, msg, meta));
    },
    info(action: string, msg: string, meta?: Record<string, unknown>) {
      emit(make("info", action, msg, meta));
    },
    warn(action: string, msg: string, meta?: Record<string, unknown>, err?: unknown) {
      emit(make("warn", action, msg, meta, err));
    },
    error(action: string, msg: string, meta?: Record<string, unknown>, err?: unknown) {
      emit(make("error", action, msg, meta, err));
    },
    /** Time an async operation and log start/end/error automatically */
    async track<T>(
      action: string,
      description: string,
      meta: Record<string, unknown> | undefined,
      fn: () => Promise<T>
    ): Promise<T> {
      const start = performance.now();
      emit(make("info", action, `Starting: ${description}`, meta));
      try {
        const result = await fn();
        const durationMs = Math.round(performance.now() - start);
        emit({ ...make("info", action, `Completed: ${description}`, { ...meta, durationMs }), durationMs });
        return result;
      } catch (err) {
        const durationMs = Math.round(performance.now() - start);
        emit({ ...make("error", action, `Failed: ${description}`, { ...meta, durationMs }, err), durationMs });
        throw err;
      }
    },
  };
}
