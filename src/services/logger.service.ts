/**
 * Centralized logging service for the Tech Fleet app.
 *
 * Provides structured, leveled logging with automatic context enrichment
 * (timestamp, service name, user ID when available). All services should
 * use this instead of raw console.log / console.error.
 *
 * Logs are written to the browser console in development and can later
 * be forwarded to an external service (e.g. Sentry, LogFlare) by
 * swapping out the transport without touching callers.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  service: string;
  action: string;
  message: string;
  timestamp: string;
  durationMs?: number;
  userId?: string;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Default minimum level — could be driven by env var or remote config
const MIN_LEVEL: LogLevel =
  (import.meta.env.VITE_LOG_LEVEL as LogLevel) || "debug";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

function formatError(err: unknown): LogEntry["error"] | undefined {
  if (!err) return undefined;
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: (err as any).code,
    };
  }
  return { name: "UnknownError", message: String(err) };
}

function emit(entry: LogEntry) {
  if (!shouldLog(entry.level)) return;

  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.service}] [${entry.action}]`;

  switch (entry.level) {
    case "debug":
      console.debug(prefix, entry.message, entry.metadata ?? "", entry.error ?? "");
      break;
    case "info":
      console.info(prefix, entry.message, entry.metadata ?? "");
      break;
    case "warn":
      console.warn(prefix, entry.message, entry.metadata ?? "", entry.error ?? "");
      break;
    case "error":
      console.error(prefix, entry.message, entry.metadata ?? "", entry.error ?? "");
      break;
  }
}

/**
 * Creates a scoped logger for a specific service.
 *
 * Usage:
 * ```ts
 * const log = createLogger("ProfileService");
 * log.info("fetch", "Loading profile", { userId });
 * log.error("update", "Failed to save", { userId }, err);
 * ```
 */
export function createLogger(service: string) {
  const makeEntry = (
    level: LogLevel,
    action: string,
    message: string,
    metadata?: Record<string, unknown>,
    err?: unknown
  ): LogEntry => ({
    level,
    service,
    action,
    message,
    timestamp: new Date().toISOString(),
    metadata,
    error: formatError(err),
  });

  return {
    debug(action: string, message: string, metadata?: Record<string, unknown>) {
      emit(makeEntry("debug", action, message, metadata));
    },
    info(action: string, message: string, metadata?: Record<string, unknown>) {
      emit(makeEntry("info", action, message, metadata));
    },
    warn(action: string, message: string, metadata?: Record<string, unknown>, err?: unknown) {
      emit(makeEntry("warn", action, message, metadata, err));
    },
    error(action: string, message: string, metadata?: Record<string, unknown>, err?: unknown) {
      emit(makeEntry("error", action, message, metadata, err));
    },

    /** Wrap an async operation with automatic start/success/error logging */
    async track<T>(
      action: string,
      description: string,
      metadata: Record<string, unknown> | undefined,
      fn: () => Promise<T>
    ): Promise<T> {
      const start = performance.now();
      emit(makeEntry("info", action, `Starting: ${description}`, metadata));
      try {
        const result = await fn();
        const durationMs = Math.round(performance.now() - start);
        const entry = makeEntry("info", action, `Completed: ${description}`, {
          ...metadata,
          durationMs,
        });
        entry.durationMs = durationMs;
        emit(entry);
        return result;
      } catch (err) {
        const durationMs = Math.round(performance.now() - start);
        const entry = makeEntry("error", action, `Failed: ${description}`, {
          ...metadata,
          durationMs,
        }, err);
        entry.durationMs = durationMs;
        emit(entry);
        throw err;
      }
    },
  };
}
