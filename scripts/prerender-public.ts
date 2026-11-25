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
import { injectRouteHead, distPathForRoute } from "@/lib/seo/prerender-html";
import {
  landingMeta,
  coursesCatalogMeta,
  projectOpeningsListMeta,
  classDetailMeta,
  courseDetailMeta,
  projectOpeningMeta,
  type PageMeta,
} from "@/lib/seo/public-route-meta";
// Course lesson/module counts + summary come from the SAME bundled registry the
// detail page uses (tsx resolves @/), so the prerendered course description is not
// a fabricated count. (The app's src/lib/stripHtml CANNOT be reused here: it
// transitively imports src/lib/security, which runs a browser-only
// DOMPurify.addHook at module load and throws in Node — "DOMPurify.addHook is not
// a function". So the HTML→text strip is a small Node-safe local below.)
import { publicCourseModules, publicCourseSummary } from "@/data/public-course-registry";

const DIST = "dist";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// The entities realistic rich text (editor / Word / Google Docs paste) produces;
// combined with generic numeric-entity decoding below, this matches the runtime
// DOMParser decode for those cases. Output is plain text, escaped at the injection
// sink (injectRouteHead), so the regex strip is never an HTML sink.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘",
  ldquo: "“", rdquo: "”", copy: "©", reg: "®", trade: "™",
};

/** Node-safe HTML→plain-text: fixpoint tag strip (robust vs nested tags) + entity decode. */
function stripToText(html: string | null | undefined): string {
  if (!html) return "";
  let prev: string;
  let s = html;
  do {
    prev = s;
    s = s.replace(/<[^>]*>/g, " ");
  } while (s !== prev);
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z0-9]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
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

  const courses = await gatewayJson<{ courses: Array<{ course_key: string; display_label: string }> }>("public-courses");
  for (const c of courses?.courses ?? []) {
    // Lesson/module counts + summary come from the SAME bundled registry the
    // detail page uses (PublicCourseDetailPage), so the prerendered description
    // matches the live page exactly — not a fabricated count. The gateway owns
    // only which courses are public + the display label.
    const mods = publicCourseModules(c.course_key);
    routes.push({
      path: `/course/${c.course_key}`,
      meta: courseDetailMeta({
        courseKey: c.course_key,
        displayLabel: c.display_label,
        summary: publicCourseSummary(c.course_key),
        lessonCount: mods ? mods.reduce((n, m) => n + m.lessons.length, 0) : 0,
        moduleCount: mods ? mods.length : 0,
      }),
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
    const out = injectRouteHead(template, meta);
    // Fail loudly if the regex injection silently missed: a prerendered route
    // MUST carry exactly one og:title and one canonical. Otherwise it degraded to
    // the shell head without failing the build (the one real risk of regex HTML
    // mutation) — better to break the build than ship a wrong/duplicate head.
    const ogTitles = (out.match(/property=["']og:title["']/g) ?? []).length;
    const canonicals = (out.match(/rel=["']canonical["']/g) ?? []).length;
    if (ogTitles !== 1 || canonicals !== 1) {
      console.error(
        `prerender: ${rel} has ${ogTitles} og:title / ${canonicals} canonical (expected 1/1) — aborting.`,
      );
      process.exit(1);
    }
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, out);
    written += 1;
  }
  const dynamic = routes.length - 3;
  console.log(`prerender: wrote ${written} route(s) (${dynamic} dynamic)${SUPABASE_URL && ANON_KEY ? "" : " — no Supabase env, static only"}.`);
}

main();
