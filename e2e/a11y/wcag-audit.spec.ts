/**
 * Phase 0 WCAG 2.2 A / AA / AAA accessibility audit.
 *
 * Iterates every route in `e2e/a11y/routes.ts`, runs axe-core against the
 * rendered DOM, and writes a structured JSON report to `a11y-report/`.
 *
 * Architecture notes (important — easy to regress):
 *
 *  - We do NOT use `test.describe.configure({ mode: "serial" })`. Serial
 *    mode means a single failed/skipped test aborts every subsequent
 *    test in the describe with "did not run", which leaves the report
 *    empty. Each route test must stand alone.
 *
 *  - Auth bootstrap happens once in `beforeAll`. We capture the resulting
 *    Supabase session from `localStorage` and replay it on every per-route
 *    page via `addInitScript`, so authed routes work without re-logging
 *    in and without depending on Playwright's `storageState` config.
 *
 *  - The report is written in `afterAll`, which runs even when individual
 *    route tests fail. The CI workflow also wipes `a11y-report/` before
 *    the run so a stale committed stub can never masquerade as fresh output.
 *
 * Credentials are read from env (TF_ADMIN_EMAIL / TF_ADMIN_PASSWORD).
 * If they aren't present the spec scans only public routes and reports
 * the rest as skipped — that way the workflow still produces a partial
 * baseline instead of failing outright.
 *
 * What axe catches: ~57% of WCAG violations (Deque published figure) —
 * the deterministic, machine-checkable subset (alt, contrast, labels,
 * ARIA, landmarks, headings, focus, duplicate ids, lang, …).
 * What axe misses: meaning of alt text, logical focus order, accuracy
 * of captions, helpfulness of error messages, etc. Those go into the
 * Phase 2 manual checklist.
 */
import { test, expect } from "../../playwright-fixture";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserContext } from "@playwright/test";
import { ROUTES, SCANNABLE_ROUTES, type RouteSpec } from "./routes";

const REPORT_DIR = "a11y-report";

// Full WCAG 2.2 surface + best-practice rules. Per user Option C we
// include AAA, but axe-core's AAA coverage is intentionally narrow
// (color-contrast-enhanced, identical-links, etc.) — most AAA criteria
// are not machine-detectable and will appear in the Phase 2 checklist.
const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag2aaa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

interface RouteFinding {
  route: RouteSpec;
  status: "scanned" | "skipped" | "error";
  message?: string;
  url?: string;
  violations?: Array<{
    id: string;
    impact: string | null | undefined;
    description: string;
    help: string;
    helpUrl: string;
    wcagTags: string[];
    nodes: Array<{ target: string[]; html: string; failureSummary?: string }>;
  }>;
}

const adminEmail = process.env.TF_ADMIN_EMAIL ?? "";
const adminPassword = process.env.TF_ADMIN_PASSWORD ?? "";
const haveAdminCreds = !!adminEmail && !!adminPassword;

// Captured once in beforeAll, replayed in every per-route page. Shape:
// the entire window.localStorage at end of login (Supabase session token,
// auth-related flags, theme, etc.).
let authedLocalStorage: Record<string, string> | null = null;
let authBootstrapError: string | null = null;
const findings: RouteFinding[] = [];

test.describe("WCAG 2.2 A/AA/AAA audit (axe-core)", () => {
  test.beforeAll(async ({ browser }) => {
    if (!haveAdminCreds) {
      authBootstrapError = "TF_ADMIN_EMAIL / TF_ADMIN_PASSWORD not provided.";
      return;
    }

    let context: BrowserContext | null = null;
    try {
      context = await browser.newContext();
      const page = await context.newPage();

      await page.goto("/login");
      await page.waitForLoadState("networkidle").catch(() => {});

      await page.getByLabel(/email/i).fill(adminEmail);

      const passwordInput = page
        .locator('input[id="password"], input[autocomplete="current-password"], input[type="password"]')
        .first();
      await expect(passwordInput).toBeVisible({ timeout: 15_000 });
      await passwordInput.fill(adminPassword);

      // Strict-mode-safe: the credentials form's submit button. Avoid the
      // permissive name regex — it also matches "Sign in with Google" and
      // the "Connect" provider button on the login page.
      const submitButton = page
        .locator('form button[type="submit"]')
        .filter({ hasText: /sign in|log in/i })
        .first();
      await expect(submitButton).toBeVisible({ timeout: 10_000 });
      await submitButton.click();

      // SPA-safe auth bootstrap: a successful password sign-in updates
      // localStorage almost immediately, but client-side routing does not
      // always trigger a fresh document "load" event for page.waitForURL()
      // — and admin sessions are intercepted by the PasskeyLoginGate modal
      // which can hold the URL on /login briefly while the dialog renders.
      //
      // The auth token in localStorage is the only signal we actually need
      // (we replay it into per-route contexts, the URL itself is irrelevant
      // to that replay). Use Promise.any so a rejection from the URL race
      // never aborts the whole bootstrap, and so we proceed the moment the
      // token shows up — typically <2s after the API call resolves.
      await Promise.any([
        page.waitForFunction(
          () =>
            Object.keys(window.localStorage).some((key) => {
              if (!/auth-token/i.test(key)) return false;
              const value = window.localStorage.getItem(key) ?? "";
              return value.includes("access_token") || value.includes("refresh_token");
            }),
          undefined,
          { timeout: 30_000 },
        ),
        page.waitForURL(
          (url) => !/\/(login|register|forgot-password)/.test(url.pathname),
          { timeout: 30_000, waitUntil: "commit" },
        ),
      ]).catch((err) => {
        // Promise.any throws AggregateError only if BOTH branches reject.
        // Re-throw with a clearer summary so the report's coverageNote
        // explains exactly what went wrong.
        const messages = err instanceof AggregateError
          ? err.errors.map((e) => (e instanceof Error ? e.message : String(e))).join(" | ")
          : err instanceof Error ? err.message : String(err);
        throw new Error(`Auth signal never appeared after sign-in click: ${messages}`);
      });

      // Give React auth state + route guards a beat to finish their first
      // render cycle before we freeze the storage snapshot.
      await page.waitForTimeout(750);

      // Snapshot localStorage for replay on subsequent contexts. Supabase
      // stores the session under a project-scoped `sb-*-auth-token` key,
      // so we just copy everything to keep the spec resilient to key churn.
      authedLocalStorage = await page.evaluate(() => {
        const out: Record<string, string> = {};
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k) out[k] = window.localStorage.getItem(k) ?? "";
        }
        return out;
      });

      const hasAuthToken = Object.entries(authedLocalStorage).some(
        ([key, value]) => /auth-token/i.test(key) && /access_token|refresh_token/.test(value),
      );

      if (!hasAuthToken) {
        throw new Error(`Login finished without a stored auth token. Current URL: ${page.url()}`);
      }
    } catch (err) {
      authBootstrapError = err instanceof Error ? err.message : String(err);
      // Don't fail the suite — public-only scan is still valuable.
      console.warn(`Admin bootstrap failed; continuing with public-only audit. ${authBootstrapError}`);
    } finally {
      await context?.close().catch(() => {});
    }
  });

  for (const route of ROUTES) {
    test(`a11y: ${route.label} (${route.path})`, async ({ page }) => {
      // Skip routes that can't be scanned (need real DB ids, email tokens, etc.)
      if (route.skipReason) {
        findings.push({ route, status: "skipped", message: route.skipReason });
        test.skip(true, route.skipReason);
        return;
      }

      // Skip authed/admin routes if creds are missing or login bootstrap failed.
      if (!authedLocalStorage && route.kind !== "public") {
        findings.push({
          route,
          status: "skipped",
          message: !haveAdminCreds
            ? "No admin credentials available in this scan run."
            : `Admin bootstrap failed before authenticated scanning: ${authBootstrapError}`,
        });
        test.skip(true, !haveAdminCreds ? "Admin credentials not provided." : "Admin bootstrap failed.");
        return;
      }

      try {
        // Replay captured session into this page's localStorage BEFORE any
        // app code runs, so AuthContext sees a logged-in user on first render.
        if (authedLocalStorage) {
          const snapshot = authedLocalStorage;
          await page.addInitScript((entries: Record<string, string>) => {
            try {
              for (const [k, v] of Object.entries(entries)) {
                window.localStorage.setItem(k, v);
              }
            } catch {
              // Storage might be blocked on the about:blank origin pre-nav;
              // the next nav will land on the real origin and re-run init.
            }
          }, snapshot);
        }

        await page.goto(route.path);
        // App is a Vite SPA; wait for network to settle so async-loaded UI is
        // present in the DOM before axe walks it.
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        // Small settle for any client-side route guards / data fetches.
        await page.waitForTimeout(500);

        const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();

        findings.push({
          route,
          status: "scanned",
          url: page.url(),
          violations: result.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            help: v.help,
            helpUrl: v.helpUrl,
            wcagTags: v.tags.filter((t) => t.startsWith("wcag")),
            nodes: v.nodes.slice(0, 5).map((n) => ({
              target: n.target as string[],
              html: n.html.slice(0, 400),
              failureSummary: n.failureSummary,
            })),
          })),
        });

        // We do NOT fail the test on violations during Phase 0 — the goal
        // is a complete baseline report. Phase 3 adds a CI gate that
        // fails on regressions vs this baseline.
      } catch (err) {
        findings.push({
          route,
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  test.afterAll(async () => {
    await mkdir(REPORT_DIR, { recursive: true });

    const totals = {
      routesTotal: ROUTES.length,
      scanned: findings.filter((f) => f.status === "scanned").length,
      skipped: findings.filter((f) => f.status === "skipped").length,
      errored: findings.filter((f) => f.status === "error").length,
      violationsTotal: findings.reduce((sum, f) => sum + (f.violations?.length ?? 0), 0),
      byImpact: { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 } as Record<string, number>,
      byCriterion: {} as Record<string, number>,
      byRule: {} as Record<string, number>,
    };

    for (const f of findings) {
      for (const v of f.violations ?? []) {
        const key = (v.impact ?? "unknown") as keyof typeof totals.byImpact;
        totals.byImpact[key] = (totals.byImpact[key] ?? 0) + 1;
        totals.byRule[v.id] = (totals.byRule[v.id] ?? 0) + 1;
        for (const tag of v.wcagTags) {
          totals.byCriterion[tag] = (totals.byCriterion[tag] ?? 0) + 1;
        }
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      authedScan: !!authedLocalStorage,
      coverageNote: !haveAdminCreds
        ? "Public-only scan — admin credentials not provided in this run."
        : authBootstrapError
          ? `Public-only scan — admin bootstrap failed before authenticated routes were scanned: ${authBootstrapError}`
          : "Authenticated scan as admin user (TF_ADMIN_EMAIL).",
      axeTags: AXE_TAGS,
      totals,
      scannableRouteCount: SCANNABLE_ROUTES.length,
      results: findings,
    };

    await writeFile(join(REPORT_DIR, "a11y-report.json"), JSON.stringify(report, null, 2), "utf8");

    // Console summary so the report is readable in CI logs without
    // downloading the artifact.
    /* eslint-disable no-console */
    console.log("\n────────── WCAG 2.2 audit summary ──────────");
    console.log(`Routes total:      ${totals.routesTotal}`);
    console.log(`  scanned:         ${totals.scanned}`);
    console.log(`  skipped:         ${totals.skipped}`);
    console.log(`  errored:         ${totals.errored}`);
    console.log(`Violations total:  ${totals.violationsTotal}`);
    console.log(`By impact:         ${JSON.stringify(totals.byImpact)}`);
    console.log(`Top rules:`);
    Object.entries(totals.byRule)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([rule, count]) => console.log(`  ${count.toString().padStart(4)}  ${rule}`));
    console.log("─────────────────────────────────────────────\n");
    /* eslint-enable no-console */
  });
});
