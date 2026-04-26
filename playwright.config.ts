import { defineConfig, devices } from "@playwright/test";

/**
 * Standalone Playwright config.
 *
 * Why not `lovable-agent-playwright-config`?
 *   That package only exists inside the Lovable sandbox — it's not
 *   published to npm, so GitHub Actions can't resolve it and `npm ci`
 *   followed by `npx playwright test` blows up with ERR_MODULE_NOT_FOUND.
 *   We replicate the same surface here so tests run identically locally,
 *   in CI, and inside Lovable.
 *
 * Base URL precedence:
 *   1. PLAYWRIGHT_BASE_URL (explicit override)
 *   2. http://127.0.0.1:4173 (vite preview, used in CI via webServer)
 */
const PORT = Number(process.env.PORT ?? 4173);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const isCI = !!process.env.CI;
const isFullMatrix = process.env.PLAYWRIGHT_FULL_MATRIX === "1";
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

const allProjects = [
  {
    name: "chromium-desktop",
    use: {
      ...devices["Desktop Chrome"],
      ...(chromiumExecutablePath ? { launchOptions: { executablePath: chromiumExecutablePath } } : {}),
    },
  },
  {
    name: "firefox-desktop",
    use: { ...devices["Desktop Firefox"] },
  },
  {
    name: "webkit-desktop",
    use: { ...devices["Desktop Safari"] },
  },
  {
    name: "mobile-chrome",
    use: { ...devices["Pixel 7"] },
  },
  {
    name: "mobile-safari",
    use: { ...devices["iPhone 14"] },
  },
  {
    name: "tablet",
    use: {
      ...devices["iPad Pro 11"],
      viewport: { width: 834, height: 1194 },
    },
  },
];

export default defineConfig({
  testDir: ".",
  testMatch: ["e2e/**/*.spec.ts"],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: isCI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: isFullMatrix ? allProjects : [allProjects[0]],
  // Only spin up our own server in CI / when explicitly requested.
  // Inside the Lovable sandbox the preview is already running on its
  // managed port, so we skip this to avoid double-binding.
  webServer:
    isCI || process.env.PLAYWRIGHT_START_SERVER === "1"
      ? {
          command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
          url: BASE_URL,
          reuseExistingServer: !isCI,
          timeout: 180_000,
          stdout: "pipe",
          stderr: "pipe",
        }
      : undefined,
});
