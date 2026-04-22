/**
 * Internal WCAG 2.2 audit runner.
 *
 * Admin-only edge function that uses the runtime secret TF_AUDIT_PASSWORD
 * to authenticate against the live preview, crawl every route, run axe-core
 * in a headless browser, and write the resulting JSON report to the
 * `audit-reports` storage bucket. Returns a signed URL the caller can fetch.
 *
 * NOTE: Deno Deploy (Supabase edge runtime) cannot launch a local Chromium.
 * Instead we use Browserless.io / browserless WebSocket if `BROWSERLESS_WS`
 * is set, OR fall back to running the scan unauthenticated via fetch + jsdom
 * + axe-core (DOM-only, no JS execution — limited but better than nothing).
 *
 * For full authenticated coverage, set BROWSERLESS_WS to a wss:// endpoint
 * (e.g. browserless.io free tier, or self-hosted).
 */
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const AUDIT_EMAIL = Deno.env.get("TF_ADMIN_EMAIL") ?? "mdenner@techfleet.org";
const AUDIT_PASSWORD = Deno.env.get("TF_AUDIT_PASSWORD") ?? "";
const BASE_URL = Deno.env.get("AUDIT_BASE_URL") ?? "https://techfleetnetwork.lovable.app";
const BROWSERLESS_WS = Deno.env.get("BROWSERLESS_WS") ?? "";

const ROUTES: Array<{ path: string; label: string; kind: "public" | "authed" | "admin"; skipReason?: string }> = [
  { path: "/", label: "Index", kind: "public" },
  { path: "/login", label: "Login", kind: "public" },
  { path: "/register", label: "Register", kind: "public" },
  { path: "/forgot-password", label: "Forgot password", kind: "public" },
  { path: "/dashboard", label: "Dashboard", kind: "authed" },
  { path: "/profile-setup", label: "Profile setup", kind: "authed" },
  { path: "/profile/edit", label: "Edit profile", kind: "authed" },
  { path: "/profile/notifications", label: "Notifications", kind: "authed" },
  { path: "/my-journey", label: "My Journey", kind: "authed" },
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

const AXE_TAGS = [
  "wcag2a", "wcag2aa", "wcag2aaa",
  "wcag21a", "wcag21aa", "wcag22aa",
  "best-practice",
];

interface Violation {
  id: string;
  impact: string;
  help: string;
  helpUrl: string;
  wcagTags: string[];
  nodeCount: number;
  nodes: Array<{ target: string[]; html: string; failureSummary: string }>;
}

interface RouteResult {
  route: typeof ROUTES[number];
  status: "scanned" | "skipped" | "error";
  url?: string;
  message?: string;
  violations?: Violation[];
}

async function requireAdmin(req: Request): Promise<{ ok: true; userId: string } | { ok: false; status: number; body: unknown }> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { ok: false, status: 401, body: { error: "Missing bearer token" } };
  const token = auth.slice(7);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { ok: false, status: 401, body: { error: "Invalid token" } };
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { count } = await admin.from("user_roles").select("id", { head: true, count: "exact" }).eq("user_id", user.id).eq("role", "admin");
  if ((count ?? 0) === 0) return { ok: false, status: 403, body: { error: "Admin role required" } };
  return { ok: true, userId: user.id };
}

async function runViaBrowserless(): Promise<{ findings: RouteResult[]; loggedIn: boolean }> {
  // Use Browserless function API: POST /function with our scan logic.
  // Requires BROWSERLESS_WS like wss://chrome.browserless.io?token=XXX OR
  // BROWSERLESS_HTTP like https://chrome.browserless.io?token=XXX.
  const httpEndpoint = BROWSERLESS_WS.replace(/^wss?:\/\//, "https://");
  const fnUrl = `${httpEndpoint.split("?")[0]}/function?${httpEndpoint.split("?")[1] ?? ""}`;

  const code = `
    module.exports = async ({ page, context }) => {
      const { baseUrl, email, password, routes, axeTags, axeSrc } = context;
      const findings = [];
      let loggedIn = false;

      // Login
      try {
        await page.goto(baseUrl + "/login", { waitUntil: "networkidle0", timeout: 30000 });
        await page.waitForSelector('input[type="email"]', { timeout: 10000 });
        await page.type('input[type="email"]', email);
        await page.type('input[type="password"]', password);
        await Promise.all([
          page.waitForNavigation({ waitUntil: "networkidle0", timeout: 25000 }).catch(() => {}),
          page.click('button[type="submit"]'),
        ]);
        const u = page.url();
        loggedIn = !/\\/(login|register|forgot)/.test(new URL(u).pathname);
      } catch (e) { loggedIn = false; }

      for (const route of routes) {
        if (!loggedIn && route.kind !== "public") {
          findings.push({ route, status: "skipped", message: "no auth" });
          continue;
        }
        const url = baseUrl + route.path;
        try {
          await page.goto(url, { waitUntil: "networkidle0", timeout: 25000 });
          await new Promise(r => setTimeout(r, 700));
          await page.evaluate(axeSrc);
          const violations = await page.evaluate(async (tags) => {
            const r = await axe.run(document, { runOnly: { type: "tag", values: tags } });
            return r.violations;
          }, axeTags);
          findings.push({
            route, status: "scanned", url: page.url(),
            violations: violations.map(v => ({
              id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl,
              wcagTags: v.tags.filter(t => t.startsWith("wcag")),
              nodeCount: v.nodes.length,
              nodes: v.nodes.slice(0, 3).map(n => ({
                target: n.target, html: (n.html || "").slice(0, 300), failureSummary: n.failureSummary,
              })),
            })),
          });
        } catch (e) {
          findings.push({ route, status: "error", message: String(e.message || e) });
        }
      }
      return { data: { findings, loggedIn }, type: "application/json" };
    };
  `;

  const axeSrc = await (await fetch("https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js")).text();

  const resp = await fetch(fnUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      context: { baseUrl: BASE_URL, email: AUDIT_EMAIL, password: AUDIT_PASSWORD, routes: ROUTES, axeTags: AXE_TAGS, axeSrc },
    }),
  });
  if (!resp.ok) throw new Error(`Browserless ${resp.status}: ${await resp.text()}`);
  return await resp.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await requireAdmin(req);
  if (!gate.ok) return new Response(JSON.stringify(gate.body), { status: gate.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (!AUDIT_PASSWORD) {
    return new Response(JSON.stringify({ error: "TF_AUDIT_PASSWORD not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!BROWSERLESS_WS) {
    return new Response(JSON.stringify({
      error: "BROWSERLESS_WS not configured",
      help: "Set BROWSERLESS_WS to a browserless.io endpoint (e.g. https://chrome.browserless.io?token=XXX). Free tier at browserless.io supports our usage.",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const { findings, loggedIn } = await runViaBrowserless();

    const totals = {
      routesTotal: ROUTES.length,
      scanned: findings.filter(f => f.status === "scanned").length,
      skipped: findings.filter(f => f.status === "skipped").length,
      errored: findings.filter(f => f.status === "error").length,
      violationsTotal: findings.reduce((s, f) => s + (f.violations?.length || 0), 0),
      byImpact: { critical: 0, serious: 0, moderate: 0, minor: 0 } as Record<string, number>,
      byRule: {} as Record<string, number>,
      byCriterion: {} as Record<string, number>,
    };
    for (const f of findings) for (const v of f.violations || []) {
      totals.byImpact[v.impact] = (totals.byImpact[v.impact] || 0) + 1;
      totals.byRule[v.id] = (totals.byRule[v.id] || 0) + 1;
      for (const t of v.wcagTags) totals.byCriterion[t] = (totals.byCriterion[t] || 0) + 1;
    }

    const report = { generatedAt: new Date().toISOString(), baseUrl: BASE_URL, authedScan: loggedIn, axeTags: AXE_TAGS, totals, results: findings };
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const path = `reports/a11y-${Date.now()}.json`;
    const { error: upErr } = await admin.storage.from("audit-reports").upload(path, JSON.stringify(report, null, 2), { contentType: "application/json", upsert: true });
    if (upErr) throw upErr;
    const { data: signed, error: sErr } = await admin.storage.from("audit-reports").createSignedUrl(path, 60 * 60);
    if (sErr) throw sErr;

    return new Response(JSON.stringify({ ok: true, totals, signedUrl: signed.signedUrl, path }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
