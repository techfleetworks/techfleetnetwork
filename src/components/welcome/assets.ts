/**
 * Welcome Flow illustration manifest.
 *
 * The unDraw-style SVGs from the Figma prototype (page "Welcome Flow", 8770:8597) are
 * exported to `src/assets/welcome-flow/` and wired here as URL imports — NEVER SVGR (§13;
 * no build dep). They are black line-art whose light areas are transparent, so each step
 * renders them on a light surface (the shell's content column).
 *
 * Alt-text rule (§13): a meaningful illustration gets a descriptive `alt`; a purely
 * decorative one gets `alt: ""` so assistive tech skips it.
 */
import welcomeSignpost from "@/assets/welcome-flow/welcome-signpost.svg";
import whyIllustration from "@/assets/welcome-flow/why-illustration.svg";
import spiralBullet from "@/assets/welcome-flow/spiral-bullet.svg";
import newsletterPlant from "@/assets/welcome-flow/newsletter-plant.svg";
import startRocket from "@/assets/welcome-flow/start-rocket.svg";

export interface WelcomeAsset {
  /** URL-imported SVG src. */
  src: string;
  /** Descriptive alt for a meaningful illustration, "" for decorative. */
  alt: string;
}

export const WELCOME_ASSETS: Record<
  "welcome" | "whyItsHelpful" | "stayUpdated" | "start",
  WelcomeAsset
> = {
  // Step (a) — signpost (node 8873:1369). Lightly meaningful: many directions to go.
  welcome: { src: welcomeSignpost, alt: "A signpost pointing in several directions" },
  // Step (c) — decorative line-art beside the list (node 8873:1426).
  whyItsHelpful: { src: whyIllustration, alt: "" },
  // Step (e) — decorative growing-plant illustration (node 8873:1580).
  stayUpdated: { src: newsletterPlant, alt: "" },
  // Step (g) — decorative rocket illustration (node 8873:1511).
  start: { src: startRocket, alt: "" },
};

/** The spiral marker used before each list item (steps c and g). Always decorative. */
export const WELCOME_SPIRAL_BULLET = spiralBullet;
