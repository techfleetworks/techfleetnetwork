/**
 * Standalone WCAG 2.2 A/AA/AAA audit runner.
 *
 * Runs in the Lovable sandbox without the Playwright test runner — uses
 * `playwright` directly + axe-core source injected into each page. This
 * avoids the lovable-agent-playwright-config dependency that is not
 * installed in this environment.
 *
 * Usage:
 *   TF_ADMIN_EMAIL=... TF_AUDIT_PASSWORD=... \
 *   BASE_URL=https://techfleetnetwork.lovable.app \
 *   node e2e/a11y/run-audit.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");

// Inline route list (mirrors e2e/a11y/routes.ts) so this runner has no
// TS build step.
const FIX = {
  questPathId: "take-flight",
  projectId: "00000000-0000-0000-0000-000000000000",
  applicationId: "00000000-0000-0000-0000-000000000000",
};
const ROUTES = [
  { path: "/", label: "Index", kind: "public" },
  { path: "/login", label: "Login", kind: "public" },
  { path: "/register", label: "Register", kind: "public" },
  { path: "/forgot-password", label: "Forgot password", kind: "public" },
  { path: "/reset-password", label: "Reset password", kind: "public", skipReason: "Recovery token required" },
  { path: "/unsubscribe", label: "Unsubscribe", kind: "public", skipReason: "Email token required" },
  { path: "/confirm-admin", label: "Confirm admin", kind: "public", skipReason: "Confirm token required" },
  { path: "/dashboard", label: "Dashboard", kind: "authed" },
  { path: "/profile-setup", label: "Profile setup", kind: "authed" },
  { path: "/profile/edit", label: "Edit profile", kind: "authed" },
  { path: "/profile/notifications", label: "Notifications", kind: "authed" },
  { path: "/my-journey", label: "My Journey", kind: "authed" },
  { path: `/my-journey/quest/${FIX.questPathId}`, label: "Quest detail", kind: "authed" },
  { path: "/courses", label: "Courses", kind: "authed" },
  { path: "/courses/connect-discord", label: "Connect Discord", kind: "authed" },
  { path: "/courses/onboarding", label: "Onboarding course", kind: "authed" },
  { path: "/courses/agile-mindset", label: "Agile mindset", kind: "authed" },
  { path: "/courses/discord-learning", label: "Discord learning", kind: "authed" },
  { path: "/courses/agile-teamwork", label: "Agile teamwork", kind: "authed" },
  { path: "/courses/project-training", label: "Project training", kind: "authed" },
  { path: "/courses/volunteer-teams", label: "Volunteer teams", kind: "authed" },
  { path: "/courses/observer", label: "Observer", kind: "authed" },
  { path: "/events", label: "Events", kind: "authed" },
  { path: "/resources", label: "Resources", kind: "authed" },
  { path: "/chat", label: "Chat", kind: "authed" },
  { path: "/applications", label: "Applications", kind: "authed" },
  { path: "/applications/general", label: "General application", kind: "authed" },
  { path: "/applications/projects", label: "My project applications", kind: "authed" },
  { path: "/project-openings", label: "Project openings list", kind: "authed" },
  { path: "/updates", label: "Community updates", kind: "authed" },
  { path: "/feedback", label: "Feedback", kind: "authed" },
  { path: "/admin/users", label: "Admin: users", kind: "admin" },
  { path: "/admin/activity-log", label: "Admin: activity log", kind: "admin" },
  { path: "/admin/clients", label: "Admin: clients", kind: "admin" },
  { path: "/admin/clients/projects/new", label: "Admin: new project", kind: "admin" },
  { path: "/admin/feedback", label: "Admin: feedback", kind: "admin" },
  { path: "/admin/roster", label: "Admin: recruiting center", kind: "admin" },
  { path: "/admin/banners", label: "Admin: banners", kind: "admin" },
  { path: "/__nonexistent-route-for-404-scan__", label: "404 NotFound", kind: "public" },
];

const BASE_URL = process.env.BASE_URL || "https://techfleetnetwork.lovable.app";
const EMAIL = process.env.TF_ADMIN_EMAIL || "mdenner@techfleet.org";
const PASSWORD = process.env.TF_AUDIT_PASSWORD || "";
const REPORT_DIR = "a11y-report";

const AXE_TAGS = [
  "wcag2a", "wcag2aa", "wcag2aaa",
  "wcag21a", "wcag21aa", "wcag22aa",
  "best-practice",
];

async function runAxe(page) {
  await page.evaluate(axeSource);
  return page.evaluate(async (tags) => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { runOnly: { type: "tag", values: tags } });
    return r.violations;
  }, AXE_TAGS);
}

async function login(page) {
  if (!PASSWORD) { console.log("✗ TF_AUDIT_PASSWORD not set"); return false; }
  console.log(`→ Logging in as ${EMAIL} at ${BASE_URL}/login`);
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
  try {
    const emailInput = page.locator('input[type="email"], input[name="email"], input[id*="email" i]').first();
    await emailInput.waitFor({ timeout: 10000 });
    await emailInput.fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((u) => !/\/(login|register|forgot)/.test(new URL(u).pathname), { timeout: 25000 });
    console.log(`✓ Logged in, landed on ${page.url()}`);
    await page.waitForTimeout(2000);
    return true;
  } catch (e) {
    console.log(`✗ Login failed: ${e.message}`);
    console.log(`  current url: ${page.url()}`);
    try {
      const txt = await page.evaluate(() => document.body.innerText.slice(0, 600));
      console.log(`  page text: ${txt.replace(/\s+/g, " ")}`);
    } catch {}
    return false;
  }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message}`));

  const loggedIn = await login(page);
  const findings = [];

  for (const route of ROUTES) {
    if (route.skipReason) {
      findings.push({ route, status: "skipped", message: route.skipReason });
      continue;
    }
    if (!loggedIn && route.kind !== "public") {
      findings.push({ route, status: "skipped", message: "no auth" });
      continue;
    }
    const url = `${BASE_URL}${route.path}`;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 25000 });
      await page.waitForTimeout(700);
      const violations = await runAxe(page);
      findings.push({
        route,
        status: "scanned",
        url: page.url(),
        violations: violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          helpUrl: v.helpUrl,
          wcagTags: v.tags.filter((t) => t.startsWith("wcag")),
          nodeCount: v.nodes.length,
          nodes: v.nodes.slice(0, 3).map((n) => ({
            target: n.target,
            html: (n.html || "").slice(0, 300),
            failureSummary: n.failureSummary,
          })),
        })),
      });
      const vc = violations.length;
      console.log(`  ${vc === 0 ? "✓" : "⚠"} ${route.path.padEnd(48)} ${vc} violation${vc===1?"":"s"}`);
    } catch (e) {
      findings.push({ route, status: "error", message: e.message });
      console.log(`  ✗ ${route.path.padEnd(48)} ERROR ${e.message.slice(0, 60)}`);
    }
  }

  await browser.close();

  // Aggregate
  const totals = {
    routesTotal: ROUTES.length,
    scanned: findings.filter((f) => f.status === "scanned").length,
    skipped: findings.filter((f) => f.status === "skipped").length,
    errored: findings.filter((f) => f.status === "error").length,
    violationsTotal: findings.reduce((s, f) => s + (f.violations?.length || 0), 0),
    byImpact: { critical: 0, serious: 0, moderate: 0, minor: 0 },
    byRule: {},
    byCriterion: {},
  };
  for (const f of findings) for (const v of f.violations || []) {
    totals.byImpact[v.impact] = (totals.byImpact[v.impact] || 0) + 1;
    totals.byRule[v.id] = (totals.byRule[v.id] || 0) + 1;
    for (const t of v.wcagTags) totals.byCriterion[t] = (totals.byCriterion[t] || 0) + 1;
  }

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(join(REPORT_DIR, "a11y-report.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE_URL, authedScan: loggedIn, axeTags: AXE_TAGS, totals, results: findings }, null, 2));

  console.log("\n══════════ WCAG 2.2 audit summary ══════════");
  console.log(`Routes: ${totals.routesTotal} (scanned ${totals.scanned}, skipped ${totals.skipped}, errored ${totals.errored})`);
  console.log(`Violations: ${totals.violationsTotal}`);
  console.log(`By impact:`, totals.byImpact);
  console.log(`Top rules:`);
  Object.entries(totals.byRule).sort((a,b) => b[1]-a[1]).slice(0, 15)
    .forEach(([r, c]) => console.log(`  ${String(c).padStart(4)}  ${r}`));
  console.log("═════════════════════════════════════════════");
})().catch((e) => { console.error(e); process.exit(1); });
