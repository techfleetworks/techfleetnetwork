// Build-time prerender of the public routes (public-access C14b). Runs after
// `vite build`: reads dist/index.html, and for each public route writes
// dist/<route>/index.html with a real <head> (title, description, canonical, OG,
// JSON-LD) built from the SAME src/lib/seo builders the runtime uses. The SPA
// body is untouched, so a JS client is unchanged while a non-JS crawler now reads
// the right head. Cloudflare serves dist/<route>/index.html for that route and
// falls back to the SPA shell for everything else (wrangler single-page-application).
//
// Dynamic routes (classes, courses, project openings) are fetched from the public
// edge gateways with the anon key — the same anon surface a visitor gets. A gateway
// failure degrades to "prerender what we can" (never fails the build): the SPA still
// renders those routes client-side.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { injectRouteHead, distPathForRoute } from "../src/lib/seo/prerender-html";
import {
  landingMeta,
  coursesCatalogMeta,
  projectOpeningsListMeta,
  classDetailMeta,
  courseDetailMeta,
  projectOpeningMeta,
  type PageMeta,
} from "../src/lib/seo/public-route-meta";

const DIST = "dist";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Minimal, dependency-free HTML→text for meta descriptions (Node-safe). */
function stripToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function gatewayJson<T>(fn: string): Promise<T | null> {
  if (!SUPABASE_URL || !ANON_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    if (!res.ok) {
      console.warn(`prerender: ${fn} returned ${res.status}; skipping its routes.`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`prerender: ${fn} fetch failed (${(err as Error).message}); skipping its routes.`);
    return null;
  }
}

/** Collect every public route + its meta. Static always; dynamic when reachable. */
async function collectRoutes(): Promise<Array<{ path: string; meta: PageMeta }>> {
  const routes: Array<{ path: string; meta: PageMeta }> = [
    { path: "/", meta: landingMeta() },
    { path: "/courses", meta: coursesCatalogMeta() },
    { path: "/project-openings", meta: projectOpeningsListMeta() },
  ];

  const classes = await gatewayJson<{ classes: Array<{ slug: string; title: string; summary: string | null; track?: string | null }> }>("public-classes");
  for (const c of classes?.classes ?? []) {
    routes.push({
      path: `/classes/${c.slug}`,
      meta: classDetailMeta({ slug: c.slug, title: c.title, summaryText: stripToText(c.summary), trackLabel: c.track ?? undefined }),
    });
  }

  const courses = await gatewayJson<{ courses: Array<{ course_key: string; display_label: string; lessons: unknown[] }> }>("public-courses");
  for (const c of courses?.courses ?? []) {
    // Lesson/module counts aren't in the gateway feed; the detail page computes
    // them from the bundled registry. For prerender meta, use the feed's lesson
    // array length and leave modules at least 1 so the sentence reads correctly.
    const lessonCount = Array.isArray(c.lessons) ? c.lessons.length : 0;
    routes.push({
      path: `/course/${c.course_key}`,
      meta: courseDetailMeta({ courseKey: c.course_key, displayLabel: c.display_label, summary: null, lessonCount, moduleCount: Math.max(1, Math.ceil(lessonCount / 5)) }),
    });
  }

  const openings = await gatewayJson<{ projects: Array<{ id: string; friendly_name: string | null; project_type: string; description: string | null; team_hats: string[] | null }> }>("public-project-openings");
  for (const p of openings?.projects ?? []) {
    routes.push({
      path: `/project-openings/${p.id}`,
      meta: projectOpeningMeta({ id: p.id, title: p.friendly_name || p.project_type, descriptionText: stripToText(p.description), teamHats: p.team_hats }),
    });
  }

  return routes;
}

async function main() {
  const templatePath = resolve(DIST, "index.html");
  if (!existsSync(templatePath)) {
    console.error("prerender: dist/index.html missing — run `vite build` first.");
    process.exit(1);
  }
  const template = readFileSync(templatePath, "utf8");

  const routes = await collectRoutes();
  let written = 0;
  for (const { path, meta } of routes) {
    const rel = distPathForRoute(path);
    // The root route IS dist/index.html — overwrite it with the landing head.
    const outPath = resolve(DIST, rel);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, injectRouteHead(template, meta));
    written += 1;
  }
  const dynamic = routes.length - 3;
  console.log(`prerender: wrote ${written} route(s) (${dynamic} dynamic)${SUPABASE_URL && ANON_KEY ? "" : " — no Supabase env, static only"}.`);
}

main();
