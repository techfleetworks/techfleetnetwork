// Module under test: src/components/SEO.tsx
// The SEO component maps a route's PageMeta to react-helmet head tags. This asserts
// the new C14a capabilities: it emits a schema.org JSON-LD <script> (wrapped in
// @context/@graph) and the OG/Twitter image tags when an ogImage is supplied.
import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { SEO } from "@/components/SEO";
import { landingMeta } from "@/lib/seo/public-route-meta";

describe("SEO (C14a)", () => {
  it("emits valid JSON-LD and OG image tags into the document head", async () => {
    render(
      <HelmetProvider>
        <SEO {...landingMeta()} ogImage="https://techfleet.network/og.png" />
      </HelmetProvider>,
    );

    await waitFor(() => {
      const ld = document.querySelector('script[type="application/ld+json"]');
      expect(ld).toBeTruthy();
      const parsed = JSON.parse(ld!.textContent!);
      expect(parsed["@context"]).toBe("https://schema.org");
      expect(Array.isArray(parsed["@graph"])).toBe(true);
      expect(parsed["@graph"].length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(
        document.querySelector('meta[property="og:image"]'),
      ).toHaveAttribute("content", "https://techfleet.network/og.png");
      expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
        "href",
        "https://techfleet.network/",
      );
    });
  });
});
