/**
 * Phase 0 WCAG 2.2 A / AA / AAA accessibility audit.
 *
 * Iterates every route in `e2e/a11y/routes.ts`, runs axe-core against the
 * rendered DOM, and writes a structured JSON report to `a11y-report/`.
 *
 * Auth: a single admin login at the start of the worker; the resulting
 * Supabase session lives in the page's localStorage and is reused for
 * every route. We don't persist storageState to disk because Lovable's
 * managed Playwright config controls that lifecycle.
 *
 * Credentials are read from env (TF_ADMIN_EMAIL / TF_ADMIN_PASSWORD).
 * In CI these are GitHub Actions repository secrets; locally drop them
 * in `.env.test` (gitignored) or export in your shell. If they aren't
 * present the spec scans only public routes and reports the rest as
 * skipped — that way the workflow still produces a partial baseline
 * instead of failing outright.
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

test.describe.configure({ mode: "serial" });

test.describe("WCAG 2.2 A/AA/AAA audit (axe-core)", () => {
  const findings: RouteFinding[] = [];

  test("login as admin (skipped if creds missing)", async ({ page }) => {
    test.skip(!haveAdminCreds, "TF_ADMIN_EMAIL / TF_ADMIN_PASSWORD not set — public-only scan.");
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/email/i).fill(adminEmail);
    await page.getByLabel(/^password$/i).fill(adminPassword);
    await page.getByRole("button", { name: /sign in|log in|connect/i }).click();
    // Successful login lands somewhere inside the authed shell.
    await page.waitForURL((url) => !/\/(login|register|forgot-password)/.test(url.pathname), {
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/.+/);
  });

  for (const route of ROUTES) {
    test(`a11y: ${route.label} (${route.path})`, async ({ page }) => {
      // Skip routes that can't be scanned (need real DB ids, email tokens, etc.)
      if (route.skipReason) {
        findings.push({ route, status: "skipped", message: route.skipReason });
        test.skip(true, route.skipReason);
        return;
      }

      // Skip authed/admin routes if we couldn't log in.
      if (!haveAdminCreds && route.kind !== "public") {
        findings.push({
          route,
          status: "skipped",
          message: "No admin credentials available in this scan run.",
        });
        test.skip(true, "Admin credentials not provided.");
        return;
      }

      try {
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
      authedScan: haveAdminCreds,
      coverageNote: haveAdminCreds
        ? "Authenticated scan as admin user (TF_ADMIN_EMAIL)."
        : "Public-only scan — admin credentials not provided in this run.",
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
