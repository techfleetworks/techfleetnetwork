import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorReporter } from "@/services/error-reporter.service";
import { registerAppServiceWorker } from "@/services/service-worker.service";

installGlobalErrorReporter();
registerAppServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);