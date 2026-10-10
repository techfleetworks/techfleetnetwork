import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // Integration tests render whole pages that import from the `@/design-system`
    // barrel, which (like any barrel) eagerly loads the full MUI-based component
    // library. Under parallel CPU load the heaviest page tests can exceed the 5s
    // default purely on import/first-render time (not a hang). 15s gives realistic
    // headroom without masking genuine hangs.
    testTimeout: 15000,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    // Inline @testing-library/jest-dom so Vitest's resolver rewrites its
    // extension-less lodash imports (avoids "Cannot find module .../isEqualWith"
    // under Node ESM strict resolution).
    server: {
      deps: {
        inline: ["@testing-library/jest-dom"],
      },
    },
    // Coverage is MEASURED here and ENFORCED by scripts/ci/check-coverage-floor.mjs against a
    // shrink-only floor (scripts/ci/coverage-floor.json) — not by vitest thresholds, so the gate
    // fails CLOSED if coverage never ran (a missing summary is red, not a silent pass). The suite is
    // sharded in CI; each shard runs with --coverage --reporter=blob and a merge job runs
    // `vitest run --merge-reports --coverage` to emit coverage/coverage-summary.json. See ci.yml.
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/test/**",
        "src/**/__tests__/**",
        "src/**/*.d.ts",
        "src/main.tsx",
        "src/integrations/supabase/types.ts",
      ],
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
