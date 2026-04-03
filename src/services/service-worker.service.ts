import { registerSW } from "virtual:pwa-register";
import { reportError } from "@/services/error-reporter.service";
import {
  getServiceWorkerErrorMessage,
  getServiceWorkerRecoveryCacheNames,
  getServiceWorkerRetryBackoffMs,
  shouldRecoverFromServiceWorkerError,
} from "@/lib/service-worker";

const SW_RECOVERY_SESSION_KEY = "techfleet:sw-recovery-attempted";

function canUseServiceWorkers(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator;
}

function wasRecoveryAttempted(): boolean {
  try {
    return sessionStorage.getItem(SW_RECOVERY_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function setRecoveryAttempted(value: boolean): void {
  try {
    if (value) {
      sessionStorage.setItem(SW_RECOVERY_SESSION_KEY, "1");
      return;
    }

    sessionStorage.removeItem(SW_RECOVERY_SESSION_KEY);
  } catch {
    // Ignore storage failures.
  }
}

async function clearRecoverableCaches(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return;
  }

  try {
    const cacheNames = await caches.keys();
    const recoverableCacheNames = getServiceWorkerRecoveryCacheNames(cacheNames);

    await Promise.allSettled(
      recoverableCacheNames.map((cacheName) => caches.delete(cacheName)),
    );
  } catch {
    // Ignore cache cleanup failures.
  }
}

async function unregisterServiceWorkers(): Promise<void> {
  if (!canUseServiceWorkers()) {
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();

    await Promise.allSettled(
      registrations.map((registration) => registration.unregister()),
    );
  } catch {
    // Ignore unregister failures.
  }
}

async function recoverFromServiceWorkerError(
  error: unknown,
  source: string,
  recoveryState: { current: boolean },
): Promise<void> {
  if (
    recoveryState.current ||
    !navigator.onLine ||
    !shouldRecoverFromServiceWorkerError(error) ||
    wasRecoveryAttempted()
  ) {
    return;
  }

  recoveryState.current = true;
  setRecoveryAttempted(true);

  reportError(
    new Error(`Recovered from service worker failure: ${getServiceWorkerErrorMessage(error)}`),
    source,
  );

  await Promise.allSettled([
    clearRecoverableCaches(),
    unregisterServiceWorkers(),
  ]);

  window.location.reload();
}

export function registerAppServiceWorker(): void {
  if (!canUseServiceWorkers()) {
    return;
  }

  const recoveryState = { current: false };
  let disposed = false;
  let updateInFlight = false;
  let consecutiveUpdateFailures = 0;
  let nextAllowedUpdateCheckAt = 0;
  let intervalId: number | undefined;
  let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;

  const markHealthy = () => {
    consecutiveUpdateFailures = 0;
    nextAllowedUpdateCheckAt = 0;
    recoveryState.current = false;
    setRecoveryAttempted(false);
  };

  const checkForUpdates = async (): Promise<void> => {
    if (
      disposed ||
      updateInFlight ||
      !navigator.onLine ||
      document.visibilityState !== "visible"
    ) {
      return;
    }

    const now = Date.now();
    if (now < nextAllowedUpdateCheckAt) {
      return;
    }

    updateInFlight = true;

    try {
      const registration = await navigator.serviceWorker.getRegistration();

      if (!registration) {
        return;
      }

      if (!registration.active && !registration.installing && !registration.waiting) {
        return;
      }

      await registration.update();
      markHealthy();
      nextAllowedUpdateCheckAt = now + 60_000;
    } catch (error) {
      consecutiveUpdateFailures += 1;
      nextAllowedUpdateCheckAt = now + getServiceWorkerRetryBackoffMs(consecutiveUpdateFailures);

      if (consecutiveUpdateFailures >= 2) {
        await recoverFromServiceWorkerError(
          error,
          "ServiceWorkerRegistration.update",
          recoveryState,
        );
      }
    } finally {
      updateInFlight = false;
    }
  };

  const triggerUpdateCheck = () => {
    void checkForUpdates();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      void checkForUpdates();
    }
  };

  const cleanup = () => {
    disposed = true;

    if (intervalId) {
      window.clearInterval(intervalId);
    }

    window.removeEventListener("focus", triggerUpdateCheck);
    window.removeEventListener("online", triggerUpdateCheck);
    window.removeEventListener("pageshow", triggerUpdateCheck);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };

  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (!updateServiceWorker) {
        return;
      }

      void updateServiceWorker(true).catch((error) =>
        recoverFromServiceWorkerError(
          error,
          "ServiceWorkerRegistration.needRefresh",
          recoveryState,
        ),
      );
    },
    onOfflineReady() {
      markHealthy();
    },
    onRegistered(registration) {
      markHealthy();

      if (!registration) {
        return;
      }

      window.addEventListener("focus", triggerUpdateCheck);
      window.addEventListener("online", triggerUpdateCheck);
      window.addEventListener("pageshow", triggerUpdateCheck);
      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("beforeunload", cleanup, { once: true });

      intervalId = window.setInterval(triggerUpdateCheck, 60_000);
      triggerUpdateCheck();
    },
    onRegisterError(error) {
      void recoverFromServiceWorkerError(
        error,
        "ServiceWorkerRegistration.register",
        recoveryState,
      );
    },
  });
}
