import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorReporter } from "@/services/error-reporter.service";
import { startDeployWatcher } from "@/lib/deploy-watcher";
import { installClientRequestThrottle } from "@/lib/client-request-throttle";
import { clearAppCachesForVersion } from "@/lib/app-cache-reset";
import { installLoginCaptchaCrossTabSync } from "@/lib/auth-captcha";

// Unregister any existing service workers and clear caches so users always get fresh content
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
  if ("caches" in window) {
    caches.keys().then((names) => names.forEach((name) => caches.delete(name)));
  }
}

installGlobalErrorReporter();
installLoginCaptchaCrossTabSync();
installClientRequestThrottle();
void clearAppCachesForVersion({ reloadAfterClear: true });
// Detect new deploys while the tab is open and refresh BEFORE a stale chunk
// fetch can fail. Pairs with lazyWithRetry as the safety net.
startDeployWatcher();

createRoot(document.getElementById("root")!).render(<App />);
