import { describe, it, expect } from "vitest";
import { injectRouteHead, distPathForRoute } from "@/lib/seo/prerender-html";
import { coursesCatalogMeta, type PageMeta } from "@/lib/seo/public-route-meta";

// A template with the same head shape as the real public/index.html: a default
// <title>, description, and an Organization JSON-LD block, plus the SPA body.
const TEMPLATE = [
  "<!doctype html>",
  '<html lang="en"><head>',
  '  <meta charset="UTF-8" />',
  "  <title>Tech Fleet Network Platform | Agile Practice and Teamwork For All</title>",
  '  <meta name="description" content="default description">',
  '  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"}]}</script>',
  "</head>",
  '<body><div id="root"></div><script type="module" src="/assets/index-abc123.js"></script></body>',
  "</html>",
].join("\n");

describe("injectRouteHead", () => {
  it("replaces title + description, injects canonical/OG, replaces JSON-LD, keeps the body", () => {
    const out = injectRouteHead(TEMPLATE, coursesCatalogMeta());

    // Title formatted with the brand suffix.
    expect(out).toMatch(/<title>Courses \| Tech Fleet Network Platform[^<]*<\/title>/);
    // Route description replaced the default.
    expect(out).not.toContain("default description");
    expect(out).toMatch(/<meta name="description" content="Browse Tech Fleet's free courses/);
    // Canonical + OG injected.
    expect(out).toContain('<link rel="canonical" href="https://techfleet.network/courses">');
    expect(out).toContain('<meta property="og:url" content="https://techfleet.network/courses">');
    expect(out).toContain('<meta property="og:type" content="website">');
    // JSON-LD replaced with the route's CollectionPage (default Organization gone).
    expect(out).toContain('"@type":"CollectionPage"');
    // Body is untouched so the SPA still boots.
    expect(out).toContain('<div id="root"></div>');
    expect(out).toContain('src="/assets/index-abc123.js"');
    // Exactly one <title> and one description tag (no duplicates left behind).
    expect(out.match(/<title>/g)).toHaveLength(1);
    expect(out.match(/name="description"/g)).toHaveLength(1);
  });

  it("escapes special characters exactly once (no double-escaping)", () => {
    const meta: PageMeta = {
      title: "Risk & Reward <demo>",
      description: 'A "quoted" & <tagged> blurb',
      canonicalPath: "/courses",
      ogType: "article",
    };
    const out = injectRouteHead(TEMPLATE, meta);
    // '&' escaped once (not &amp;amp;), '<' escaped in the title text.
    expect(out).toContain("<title>Risk &amp; Reward &lt;demo&gt;");
    expect(out).not.toContain("&amp;amp;");
    // Attribute value escapes the quote and the angle brackets.
    expect(out).toContain('content="A &quot;quoted&quot; &amp; &lt;tagged&gt; blurb"');
  });

  it("DISCRIMINATING: replaces the template's existing OG tags in place (no duplicates)", () => {
    // Mirror index.html, which already ships og:title/description/type + twitter:*.
    const withOg = TEMPLATE.replace(
      "</head>",
      [
        '  <meta property="og:type" content="website" />',
        '  <meta property="og:title" content="DEFAULT TITLE">',
        '  <meta property="og:description" content="default og description">',
        '  <meta name="twitter:title" content="DEFAULT TITLE">',
        "</head>",
      ].join("\n"),
    );
    const out = injectRouteHead(withOg, coursesCatalogMeta());
    // Each OG/twitter tag appears exactly once — replaced, not duplicated.
    expect(out.match(/property="og:title"/g)).toHaveLength(1);
    expect(out.match(/property="og:description"/g)).toHaveLength(1);
    expect(out.match(/property="og:type"/g)).toHaveLength(1);
    expect(out.match(/name="twitter:title"/g)).toHaveLength(1);
    // And the surviving one carries the route's value, not the default.
    expect(out).not.toContain('content="DEFAULT TITLE"');
    expect(out).not.toContain("default og description");
    expect(out).toMatch(/property="og:title" content="Courses \| Tech Fleet/);
  });

  it("injects JSON-LD before </head> when the template has none", () => {
    const noLd = TEMPLATE.replace(
      /<script type="application\/ld\+json">[\s\S]*?<\/script>\n/,
      "",
    );
    const out = injectRouteHead(noLd, coursesCatalogMeta());
    expect(out).toContain('application/ld+json');
    expect(out.indexOf("application/ld+json")).toBeLessThan(out.indexOf("</head>"));
  });
});

describe("distPathForRoute", () => {
  it("maps a route to its dist/<route>/index.html path", () => {
    expect(distPathForRoute("/")).toBe("index.html");
    expect(distPathForRoute("/courses")).toBe("courses/index.html");
    expect(distPathForRoute("/project-openings/abc-123")).toBe(
      "project-openings/abc-123/index.html",
    );
    expect(distPathForRoute("/course/agile-mindset")).toBe("course/agile-mindset/index.html");
  });
});
