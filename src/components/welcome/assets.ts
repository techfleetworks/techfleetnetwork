/**
 * Welcome Flow illustration manifest.
 *
 * The unDraw-style SVGs + "peep" character from Figma (node 8770:8597) are exported to
 * `src/assets/welcome-flow/` and wired here as URL imports — NEVER SVGR (§13; no build
 * dep). Until an asset is exported, its `src` stays `null` and the step renders without
 * an illustration (no broken import, no invented art). To add one:
 *
 *   import welcomeAHero from "@/assets/welcome-flow/welcome-a-hero.svg";
 *   welcome: { src: welcomeAHero, alt: "..." }
 *
 * Alt-text rule (§13): meaningful illustration → descriptive `alt`; purely decorative →
 * `alt: ""`. `alt: null` here means "asset not yet supplied".
 */
export interface WelcomeAsset {
  /** URL-imported SVG (or raster) src, or null until the Figma asset is exported. */
  src: string | null;
  /** Descriptive alt for a meaningful illustration, "" for decorative, null if absent. */
  alt: string | null;
}

export const WELCOME_ASSETS: Record<"welcome" | "whyItsHelpful", WelcomeAsset> = {
  // Step (a) — Engraving family, brand mint (§13). Descriptive alt.
  welcome: { src: null, alt: null },
  // Step (c) — Sketch-Fill family, --primary (§13). Descriptive alt.
  whyItsHelpful: { src: null, alt: null },
};
