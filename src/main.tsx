import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorReporter } from "@/services/error-reporter.service";

installGlobalErrorReporter();

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateSW(true);
  },
  onOfflineReady() {
    // no-op
  },
  onRegistered(registration) {
    if (!registration) return;

    const checkForUpdates = () => {
      if (!navigator.onLine) return;
      if (!registration.active && !registration.installing && !registration.waiting) return;
      registration.update().catch(() => {
        // Silently ignore SW update failures (network blips, null worker, etc.)
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkForUpdates();
      }
    };

    window.addEventListener("focus", checkForUpdates);
    window.addEventListener("online", checkForUpdates);
    window.addEventListener("pageshow", checkForUpdates);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    checkForUpdates();
    const intervalId = window.setInterval(checkForUpdates, 60 * 1000);

    window.addEventListener(
      "beforeunload",
      () => {
        window.clearInterval(intervalId);
        window.removeEventListener("focus", checkForUpdates);
        window.removeEventListener("online", checkForUpdates);
        window.removeEventListener("pageshow", checkForUpdates);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      },
      { once: true },
    );
  },
});

createRoot(document.getElementById("root")!).render(<App />);