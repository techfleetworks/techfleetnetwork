type ServiceLogLevel = "warn" | "error";

type ServiceLogger = Record<ServiceLogLevel, (action: string, message: string, metadata?: Record<string, unknown>, error?: unknown) => void>;

export interface ServiceErrorLike {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

interface HandleServiceErrorOptions {
  logger: ServiceLogger;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
  level?: ServiceLogLevel;
  throwMessage?: string;
}

export function serviceErrorMetadata(error: ServiceErrorLike): Record<string, unknown> {
  return {
    errorCode: error.code,
    errorDetails: error.details,
    errorHint: error.hint,
  };
}

export function handleServiceError(error: ServiceErrorLike | null | undefined, options: HandleServiceErrorOptions): boolean {
  if (!error) return false;

  const level = options.level ?? "error";
  options.logger[level](
    options.action,
    options.message,
    { ...(options.metadata ?? {}), ...serviceErrorMetadata(error) },
    error,
  );

  if (options.throwMessage) throw new Error(options.throwMessage);
  return true;
}