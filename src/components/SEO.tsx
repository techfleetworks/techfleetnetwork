import { Helmet } from "react-helmet-async";
import {
  formatTitle,
  absoluteUrl,
  jsonLdToString,
  withContext,
  type JsonLd,
} from "@/lib/seo/public-route-meta";

interface SEOProps {
  title: string;
  description: string;
  canonicalPath?: string;
  ogType?: "website" | "article";
  /** Absolute image URL for the OG/Twitter card. Omitted -> no image tags. */
  ogImage?: string;
  /** schema.org node(s); wrapped in @context/@graph and emitted as JSON-LD. */
  jsonLd?: JsonLd;
}

export function SEO({
  title,
  description,
  canonicalPath,
  ogType = "website",
  ogImage,
  jsonLd,
}: SEOProps) {
  // Title formatting + canonical URL are owned by the shared meta module, so the
  // runtime head and the C14b prerender build identical tags from one source.
  const fullTitle = formatTitle(title);
  const canonical = absoluteUrl(canonicalPath ?? "");

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content={ogType} />
      {/* Image + card tags are emitted ONLY when a page supplies an ogImage, so a
          page that passes neither ogImage nor jsonLd renders byte-identical head to
          the pre-C14a component (no unscoped change to the ~15 other SEO callers). */}
      {ogImage && <meta name="twitter:card" content="summary_large_image" />}
      {ogImage && <meta property="og:image" content={ogImage} />}
      {ogImage && <meta name="twitter:image" content={ogImage} />}
      {jsonLd && (
        <script type="application/ld+json">{jsonLdToString(withContext(jsonLd))}</script>
      )}
    </Helmet>
  );
}
