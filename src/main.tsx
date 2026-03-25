import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorReporter } from "@/services/error-reporter.service";

installGlobalErrorReporter();

registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload();
  },
  onOfflineReady() {
    // no-op
  },
});

createRoot(document.getElementById("root")!).render(<App />);