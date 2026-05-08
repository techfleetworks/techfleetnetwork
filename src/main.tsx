import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorReporter } from "@/services/error-reporter.service";
import { startDeployWatcher } from "@/lib/deploy-watcher";
import { installClientRequestThrottle } from "@/lib/client-request-throttle";
import { clearAppCachesForVersion } from "@/lib/app-cache-reset";
import { installLoginCaptchaCrossTabSync } from "@/lib/auth-captcha";
import { installWebVitalsBeacon } from "@/lib/web-vitals";
import { installAltClickNewTab } from "@/lib/alt-click-new-tab";
import "@/i18n"; // initialize i18next + apply <html lang>/<html dir>

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
// Real User Monitoring — Core Web Vitals beacon. Deferred internally; honours
// Save-Data; library is dynamically imported so it's not in the main bundle.
installWebVitalsBeacon();

createRoot(document.getElementById("root")!).render(<App />);
