import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorReporter } from "@/services/error-reporter.service";

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

createRoot(document.getElementById("root")!).render(<App />);
