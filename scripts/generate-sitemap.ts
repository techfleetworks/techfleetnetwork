// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.
// Fetches dynamic project openings from the database and merges them with static routes.

import { writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://techfleet.network";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const staticEntries: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/login", changefreq: "monthly", priority: "0.6" },
  { path: "/register", changefreq: "monthly", priority: "0.7" },
  { path: "/forgot-password", changefreq: "yearly", priority: "0.3" },
  { path: "/reset-password", changefreq: "yearly", priority: "0.3" },
  { path: "/project-openings", changefreq: "daily", priority: "0.9" },
  { path: "/accessibility", changefreq: "monthly", priority: "0.5" },
  { path: "/privacy", changefreq: "monthly", priority: "0.5" },
  { path: "/cookies", changefreq: "monthly", priority: "0.5" },
  { path: "/terms", changefreq: "monthly", priority: "0.5" },
  { path: "/terms-of-use", changefreq: "monthly", priority: "0.5" },
  { path: "/code-of-conduct", changefreq: "monthly", priority: "0.5" },
  { path: "/privacy/dsar", changefreq: "yearly", priority: "0.3" },
  { path: "/confirm-admin", changefreq: "monthly", priority: "0.3" },
  { path: "/confirm-teacher", changefreq: "monthly", priority: "0.3" },
  { path: "/unsubscribe", changefreq: "yearly", priority: "0.1" },
  { path: "/profile-setup", changefreq: "monthly", priority: "0.5" },
  { path: "/dashboard", changefreq: "weekly", priority: "0.8" },
  { path: "/courses", changefreq: "weekly", priority: "0.8" },
  { path: "/courses/connect-discord", changefreq: "monthly", priority: "0.5" },
  { path: "/courses/onboarding", changefreq: "monthly", priority: "0.5" },
  { path: "/courses/agile-mindset", changefreq: "monthly", priority: "0.5" },
  { path: "/events", changefreq: "weekly", priority: "0.8" },
  { path: "/resources", changefreq: "weekly", priority: "0.8" },
  { path: "/chat", changefreq: "weekly", priority: "0.6" },
  { path: "/applications", changefreq: "weekly", priority: "0.7" },
  { path: "/applications/general", changefreq: "weekly", priority: "0.7" },
  { path: "/applications/projects", changefreq: "weekly", priority: "0.7" },
  { path: "/my-journey", changefreq: "weekly", priority: "0.8" },
  { path: "/updates", changefreq: "daily", priority: "0.8" },
  { path: "/profile/edit", changefreq: "monthly", priority: "0.4" },
  { path: "/profile/notifications", changefreq: "monthly", priority: "0.4" },
];

async function fetchDynamicEntries(): Promise<SitemapEntry[]> {
  try {
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn("Missing Supabase env vars; skipping dynamic project openings in sitemap.");
      return [];
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/project_openings?select=slug,updated_at&status=eq.published`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!res.ok) {
      console.warn(`Failed to fetch project openings for sitemap: ${res.status}`);
      return [];
    }

    const rows = (await res.json()) as Array<{ slug: string; updated_at?: string }>;

    return rows.map((row) => ({
      path: `/project-openings/${row.slug}`,
      lastmod: row.updated_at ? row.updated_at.split("T")[0] : undefined,
      changefreq: "weekly" as const,
      priority: "0.8",
    }));
  } catch (err) {
    console.warn("Error fetching dynamic sitemap entries:", err);
    return [];
  }
}

function generateSitemap(entries: SitemapEntry[]) {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n")
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

async function main() {
  const dynamicEntries = await fetchDynamicEntries();
  const allEntries = [...staticEntries, ...dynamicEntries];
  writeFileSync(resolve("public/sitemap.xml"), generateSitemap(allEntries));
  console.log(`sitemap.xml written (${allEntries.length} entries, ${dynamicEntries.length} dynamic)`);
}

main();
