/**
 * Privacy & Cookies — Push 3 hardening proof.
 *
 * Asserts that on a fresh browser (no consent stored) NO requests are made
 * to GA4 / Clarity / GTM / DoubleClick / YouTube / Discord trackers across
 * every public route. Consent-gated analytics must never load until the
 * user clicks "Accept all" in the cookie banner.
 *
 * If this test ever fails it means we shipped a regression that violates
 * EU/UK ePrivacy, Swiss FADP, LGPD, or PIPL — block the merge.
 */
import { test, expect } from "@playwright/test";

const BLOCKED_HOSTS = [
  "google-analytics.com",
  "googletagmanager.com",
  "doubleclick.net",
  "clarity.ms",
  "youtube.com",
  "youtube-nocookie.com",
  "discord.com",
  "discordapp.com",
];

const PUBLIC_ROUTES = ["/", "/login", "/register", "/privacy", "/cookies", "/accessibility"];

test.describe("No third-party trackers before consent", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`route ${route} fires zero tracker requests pre-consent`, async ({ page, context }) => {
      await context.clearCookies();
      await context.addInitScript(() => {
        try {
          window.localStorage.removeItem("tfn.consent.v1");
        } catch {
          // Storage unavailable — non-fatal.
        }
      });

      const offenders: string[] = [];
      page.on("request", (req) => {
        const url = req.url();
        if (BLOCKED_HOSTS.some((h) => url.includes(h))) {
          offenders.push(`${req.method()} ${url}`);
        }
      });

      await page.goto(route, { waitUntil: "networkidle" });
      // Give deferred / setTimeout-loaded scripts a chance to fire.
      await page.waitForTimeout(2000);

      expect(
        offenders,
        `Unexpected tracker requests on ${route}:\n${offenders.join("\n")}`,
      ).toEqual([]);
    });
  }
});
