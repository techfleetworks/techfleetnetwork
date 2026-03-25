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
      void registration.update();
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
    window.setInterval(checkForUpdates, 60 * 1000);
  },
});

createRoot(document.getElementById("root")!).render(<App />);