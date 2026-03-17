import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorReporter } from "@/services/error-reporter.service";

// Capture unhandled errors & rejections → audit_log for admin visibility
installGlobalErrorReporter();

createRoot(document.getElementById("root")!).render(<App />);