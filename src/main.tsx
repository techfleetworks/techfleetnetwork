import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorReporter } from "@/services/error-reporter.service";
import { registerAppServiceWorker } from "@/services/service-worker.service";

// Suppress browser-surfaced SW fetch errors from appearing in console —
// the service-worker.service recovery logic handles these automatically.
window.addEventListener("unhandledrejection", (event) => {
  const msg = String(event.reason?.message ?? event.reason ?? "");
  if (
    msg.includes("Failed to update a ServiceWorker") ||
    msg.includes("An unknown error occurred when fetching the script") ||
    msg.includes("Failed to register a ServiceWorker")
  ) {
    event.preventDefault();
  }
});

installGlobalErrorReporter();
registerAppServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
