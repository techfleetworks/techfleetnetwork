import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Inline @testing-library/jest-dom so Vitest's resolver rewrites its
    // extension-less lodash imports (avoids "Cannot find module .../isEqualWith"
    // under Node ESM strict resolution).
    server: {
      deps: {
        inline: ["@testing-library/jest-dom"],
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
