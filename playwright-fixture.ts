/**
 * Playwright fixture re-export.
 *
 * Historically this re-exported from `lovable-agent-playwright-config/fixture`,
 * which only exists inside the Lovable sandbox. CI couldn't resolve it
 * (ERR_MODULE_NOT_FOUND on `npm ci`), so we now re-export the standard
 * @playwright/test surface. Tests work identically — they just consume
 * `test`, `expect`, and `Page` types from here.
 *
 * If we ever need shared fixtures (auth, seeded DB rows, etc.) extend
 * `base.test` here using `base.test.extend(...)` so every spec picks
 * them up via this single import.
 */
export { test, expect } from "@playwright/test";
export type { Page, Locator, BrowserContext } from "@playwright/test";
