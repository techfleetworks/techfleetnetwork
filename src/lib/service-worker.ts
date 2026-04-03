const RECOVERABLE_SERVICE_WORKER_ERROR_FRAGMENTS = [
  "failed to update a serviceworker",
  "failed to register a serviceworker",
  "an unknown error occurred when fetching the script",
  "serviceworker script evaluation failed",
  "bad-http-response",
] as const;

const RECOVERABLE_SERVICE_WORKER_CACHE_FRAGMENTS = [
  "workbox",
  "vite-pwa",
  "precache",
  "google-fonts-cache",
  "gstatic-fonts-cache",
] as const;

export function getServiceWorkerErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function shouldRecoverFromServiceWorkerError(error: unknown): boolean {
  const message = getServiceWorkerErrorMessage(error).toLowerCase();

  return RECOVERABLE_SERVICE_WORKER_ERROR_FRAGMENTS.some((fragment) =>
    message.includes(fragment),
  );
}

export function getServiceWorkerRecoveryCacheNames(cacheNames: string[]): string[] {
  return cacheNames.filter((cacheName) => {
    const normalizedCacheName = cacheName.toLowerCase();

    return RECOVERABLE_SERVICE_WORKER_CACHE_FRAGMENTS.some((fragment) =>
      normalizedCacheName.includes(fragment),
    );
  });
}

export function getServiceWorkerRetryBackoffMs(failureCount: number): number {
  const safeFailureCount = Math.max(1, Math.floor(failureCount));

  return Math.min(5 * 60_000, 30_000 * 2 ** (safeFailureCount - 1));
}
