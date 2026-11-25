// Pure head-injection for the C14b build-time prerender. Given the built
// index.html as a template and a route's PageMeta, produce that route's HTML with
// a real <head> (title, description, canonical, Open Graph, JSON-LD). No DOM, no
// fetch — a string transform, so it runs in the Node prerender and is unit-tested.
//
// The BODY (the #root mount + entry <script>) is deliberately untouched: the SPA
// still boots and hydrates over the prerendered head, so a JS client is unchanged
// while a non-JS crawler now reads the right head.
import {
  formatTitle,
  absoluteUrl,
  jsonLdToString,
  withContext,
  type PageMeta,
} from "./public-route-meta";

const TITLE_RE = /<title>[\s\S]*?<\/title>/i;
const JSONLD_RE = /<script\s+type=["']application\/ld\+json["']>[\s\S]*?<\/script>/i;
const HEAD_CLOSE_RE = /<\/head>/i;

/** A `<meta name="X">` matcher (any attribute order, self-closing or not). */
const metaName = (name: string) =>
  new RegExp(`<meta\\s+[^>]*name=["']${name}["'][^>]*>`, "i");
/** A `<meta property="X">` matcher. */
const metaProp = (prop: string) =>
  new RegExp(`<meta\\s+[^>]*property=["']${prop}["'][^>]*>`, "i");
const CANONICAL_RE = /<link\s+[^>]*rel=["']canonical["'][^>]*>/i;

/**
 * Replace the first tag matching `re` with `tag`; if the template has none,
 * inject `tag` once before </head>. This is what keeps the prerender from
 * DUPLICATING the Open Graph tags index.html already ships (replace in place),
 * while still adding tags the template lacks (canonical, og:url).
 */
function upsert(html: string, re: RegExp, tag: string): string {
  return re.test(html)
    ? html.replace(re, tag)
    : html.replace(HEAD_CLOSE_RE, `    ${tag}\n  </head>`);
}

/** Escape for an HTML text node (<title>…). */
function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/** Escape for a double-quoted HTML attribute value. */
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Inject `meta` into a copy of `templateHtml`'s head. Replaces the existing
 * <title>, description, and (if the route has JSON-LD) the first ld+json block;
 * injects canonical + Open Graph (and image/Twitter tags only when ogImage is
 * set) before </head>. Raw values are escaped exactly once per sink.
 */
export function injectRouteHead(templateHtml: string, meta: PageMeta): string {
  const rawFullTitle = formatTitle(meta.title);
  const title = escapeAttr(rawFullTitle);
  const desc = escapeAttr(meta.description);
  const canonical = escapeAttr(absoluteUrl(meta.canonicalPath));
  let html = templateHtml;

  html = html.replace(TITLE_RE, `<title>${escapeText(rawFullTitle)}</title>`);

  // Replace the tags index.html already ships (so we never duplicate them); add
  // the ones it lacks (canonical, og:url) before </head>.
  html = upsert(html, metaName("description"), `<meta name="description" content="${desc}">`);
  html = upsert(html, CANONICAL_RE, `<link rel="canonical" href="${canonical}">`);
  html = upsert(html, metaProp("og:title"), `<meta property="og:title" content="${title}">`);
  html = upsert(html, metaProp("og:description"), `<meta property="og:description" content="${desc}">`);
  html = upsert(html, metaProp("og:url"), `<meta property="og:url" content="${canonical}">`);
  html = upsert(html, metaProp("og:type"), `<meta property="og:type" content="${escapeAttr(meta.ogType)}">`);
  html = upsert(html, metaName("twitter:title"), `<meta name="twitter:title" content="${title}">`);
  html = upsert(html, metaName("twitter:description"), `<meta name="twitter:description" content="${desc}">`);

  // Only override the social image when the route supplies one; otherwise keep
  // the template's default image/card tags.
  if (meta.ogImage) {
    const img = escapeAttr(meta.ogImage);
    html = upsert(html, metaProp("og:image"), `<meta property="og:image" content="${img}">`);
    html = upsert(html, metaName("twitter:image"), `<meta name="twitter:image" content="${img}">`);
    html = upsert(html, metaName("twitter:card"), `<meta name="twitter:card" content="summary_large_image">`);
  }

  if (meta.jsonLd) {
    const block = `<script type="application/ld+json">${jsonLdToString(
      withContext(meta.jsonLd),
    )}</script>`;
    html = JSONLD_RE.test(html)
      ? html.replace(JSONLD_RE, block)
      : html.replace(HEAD_CLOSE_RE, `    ${block}\n  </head>`);
  }

  return html;
}

/** The filesystem path (relative to dist/) a route's prerendered HTML is written to. */
export function distPathForRoute(routePath: string): string {
  const clean = routePath.replace(/^\/+/, "").replace(/\/+$/, "");
  return clean === "" ? "index.html" : `${clean}/index.html`;
}
