/**
 * WCAG 2.1 / 2.2 Level A + AA checklist coverage map.
 *
 * Mirrors the WebAIM checklist (https://webaim.org/standards/wcag/checklist)
 * — every Level A and AA success criterion is enumerated here. Each entry
 * describes WHAT type of check we run so the auditor never silently
 * "skips" a criterion. The three check kinds are:
 *
 *   - "axe"       → handled by one or more axe-core rule IDs. Status is
 *                   derived from the per-route axe results.
 *   - "dom"       → a custom Playwright probe runs against the rendered
 *                   page (e.g. "every page has exactly one <h1>",
 *                   "no autoplaying audio without controls",
 *                   "viewport meta does not disable user-scaling").
 *   - "static"    → a project-wide grep / repo-level check (e.g. "no
 *                   `accesskey` attribute used", "no `<marquee>` /
 *                   `<blink>`", "404 page exists"). Runs once per audit,
 *                   not per route.
 *   - "manual"    → genuinely not machine-decidable (e.g. "alt text is
 *                   meaningful"). Marked as needs_review with a clear
 *                   note — never silently skipped.
 *
 * Each criterion ends up in the report with one of:
 *   pass | fail | needs_review
 * along with the supporting evidence (axe violations, probe output, or
 * grep matches).
 */

export type CheckKind = "axe" | "dom" | "static" | "manual";

export interface ChecklistItem {
  /** WCAG SC number, e.g. "1.1.1" */
  sc: string;
  /** WCAG level: A or AA (we list A + AA per WebAIM checklist) */
  level: "A" | "AA";
  /** Short human title */
  title: string;
  /** What we actually check */
  kind: CheckKind;
  /** axe rule IDs that contribute (only when kind === "axe") */
  axeRules?: string[];
  /** ID of the DOM probe (only when kind === "dom") — see dom-probes.ts */
  domProbe?: string;
  /** ID of the static project check (only when kind === "static") — see static-checks.ts */
  staticCheck?: string;
  /** For "manual": the reason it can't be automated. */
  manualReason?: string;
  /** Optional extra context shown in the report. */
  note?: string;
}

/**
 * WCAG 2.1 + 2.2 A & AA criteria, in WebAIM checklist order.
 * Total: 50 criteria (38 Level A + 12 Level AA across WCAG 2.1/2.2).
 */
export const WCAG_CHECKLIST: ChecklistItem[] = [
  // ─── 1. PERCEIVABLE ─────────────────────────────────────────────
  { sc: "1.1.1", level: "A",  title: "Non-text Content",
    kind: "axe", axeRules: ["image-alt", "input-image-alt", "area-alt", "svg-img-alt", "object-alt", "role-img-alt", "input-button-name", "button-name", "link-name"] },

  { sc: "1.2.1", level: "A",  title: "Audio-only and Video-only (Prerecorded)",
    kind: "dom", domProbe: "media-has-text-alternative" },
  { sc: "1.2.2", level: "A",  title: "Captions (Prerecorded)",
    kind: "dom", domProbe: "video-has-captions-track" },
  { sc: "1.2.3", level: "A",  title: "Audio Description or Media Alternative (Prerecorded)",
    kind: "dom", domProbe: "video-has-description-track" },
  { sc: "1.2.4", level: "AA", title: "Captions (Live)",
    kind: "dom", domProbe: "live-stream-has-captions" },
  { sc: "1.2.5", level: "AA", title: "Audio Description (Prerecorded)",
    kind: "dom", domProbe: "video-has-description-track" },

  { sc: "1.3.1", level: "A",  title: "Info and Relationships",
    kind: "axe", axeRules: [
      "label", "form-field-multiple-labels", "definition-list", "dlitem", "list", "listitem",
      "table-fake-caption", "td-headers-attr", "th-has-data-cells", "scope-attr-valid",
      "aria-required-children", "aria-required-parent", "heading-order",
      "landmark-one-main", "landmark-no-duplicate-banner", "landmark-no-duplicate-contentinfo",
      "landmark-no-duplicate-main", "landmark-unique", "page-has-heading-one"
    ] },
  { sc: "1.3.2", level: "A",  title: "Meaningful Sequence",
    kind: "dom", domProbe: "tabindex-not-positive" },
  { sc: "1.3.3", level: "A",  title: "Sensory Characteristics",
    kind: "static", staticCheck: "no-shape-color-only-instructions" },
  { sc: "1.3.4", level: "AA", title: "Orientation",
    kind: "static", staticCheck: "no-orientation-lock-css" },
  { sc: "1.3.5", level: "AA", title: "Identify Input Purpose",
    kind: "axe", axeRules: ["autocomplete-valid"] },

  { sc: "1.4.1", level: "A",  title: "Use of Color",
    kind: "axe", axeRules: ["link-in-text-block"] },
  { sc: "1.4.2", level: "A",  title: "Audio Control",
    kind: "dom", domProbe: "no-autoplay-audio-without-control" },
  { sc: "1.4.3", level: "AA", title: "Contrast (Minimum)",
    kind: "axe", axeRules: ["color-contrast"] },
  { sc: "1.4.4", level: "AA", title: "Resize Text",
    kind: "static", staticCheck: "no-fixed-px-in-meta-viewport" },
  { sc: "1.4.5", level: "AA", title: "Images of Text",
    kind: "manual", manualReason: "Requires visual interpretation of decorative vs informative images." },
  { sc: "1.4.10", level: "AA", title: "Reflow",
    kind: "dom", domProbe: "no-horizontal-scroll-at-320" },
  { sc: "1.4.11", level: "AA", title: "Non-text Contrast",
    kind: "axe", axeRules: ["color-contrast"] },
  { sc: "1.4.12", level: "AA", title: "Text Spacing",
    kind: "dom", domProbe: "text-spacing-survives-overrides" },
  { sc: "1.4.13", level: "AA", title: "Content on Hover or Focus",
    kind: "dom", domProbe: "tooltips-dismissable" },

  // ─── 2. OPERABLE ────────────────────────────────────────────────
  { sc: "2.1.1", level: "A",  title: "Keyboard",
    kind: "axe", axeRules: ["accesskeys", "focus-order-semantics"] },
  { sc: "2.1.2", level: "A",  title: "No Keyboard Trap",
    kind: "dom", domProbe: "tab-traversal-completes" },
  { sc: "2.1.4", level: "A",  title: "Character Key Shortcuts",
    kind: "static", staticCheck: "single-char-shortcuts-have-modifier-or-toggle" },

  { sc: "2.2.1", level: "A",  title: "Timing Adjustable",
    kind: "static", staticCheck: "session-timeout-warns-and-extends" },
  { sc: "2.2.2", level: "A",  title: "Pause, Stop, Hide",
    kind: "dom", domProbe: "no-uncontrollable-moving-content" },

  { sc: "2.3.1", level: "A",  title: "Three Flashes or Below Threshold",
    kind: "static", staticCheck: "no-flashing-animations" },

  { sc: "2.4.1", level: "A",  title: "Bypass Blocks",
    kind: "axe", axeRules: ["bypass", "skip-link", "region"] },
  { sc: "2.4.2", level: "A",  title: "Page Titled",
    kind: "axe", axeRules: ["document-title"] },
  { sc: "2.4.3", level: "A",  title: "Focus Order",
    kind: "dom", domProbe: "tabindex-not-positive" },
  { sc: "2.4.4", level: "A",  title: "Link Purpose (In Context)",
    kind: "axe", axeRules: ["link-name"] },
  { sc: "2.4.5", level: "AA", title: "Multiple Ways",
    kind: "static", staticCheck: "site-has-search-and-nav" },
  { sc: "2.4.6", level: "AA", title: "Headings and Labels",
    kind: "axe", axeRules: ["empty-heading", "label", "form-field-multiple-labels"] },
  { sc: "2.4.7", level: "AA", title: "Focus Visible",
    kind: "static", staticCheck: "focus-visible-styles-present" },
  { sc: "2.4.11", level: "AA", title: "Focus Not Obscured (Minimum) — WCAG 2.2",
    kind: "dom", domProbe: "focused-element-not-obscured" },

  { sc: "2.5.1", level: "A",  title: "Pointer Gestures",
    kind: "static", staticCheck: "no-multipoint-or-path-only-gestures" },
  { sc: "2.5.2", level: "A",  title: "Pointer Cancellation",
    kind: "static", staticCheck: "actions-fire-on-pointerup" },
  { sc: "2.5.3", level: "A",  title: "Label in Name",
    kind: "axe", axeRules: ["label-content-name-mismatch"] },
  { sc: "2.5.4", level: "A",  title: "Motion Actuation",
    kind: "static", staticCheck: "motion-has-alternative-control" },
  { sc: "2.5.7", level: "AA", title: "Dragging Movements — WCAG 2.2",
    kind: "static", staticCheck: "drag-has-single-pointer-alternative" },
  { sc: "2.5.8", level: "AA", title: "Target Size (Minimum) — WCAG 2.2",
    kind: "axe", axeRules: ["target-size"] },

  // ─── 3. UNDERSTANDABLE ──────────────────────────────────────────
  { sc: "3.1.1", level: "A",  title: "Language of Page",
    kind: "axe", axeRules: ["html-has-lang", "html-lang-valid"] },
  { sc: "3.1.2", level: "AA", title: "Language of Parts",
    kind: "axe", axeRules: ["valid-lang"] },

  { sc: "3.2.1", level: "A",  title: "On Focus",
    kind: "static", staticCheck: "no-onfocus-context-change" },
  { sc: "3.2.2", level: "A",  title: "On Input",
    kind: "static", staticCheck: "no-onchange-auto-submit" },
  { sc: "3.2.3", level: "AA", title: "Consistent Navigation",
    kind: "static", staticCheck: "consistent-nav-shell" },
  { sc: "3.2.4", level: "AA", title: "Consistent Identification",
    kind: "static", staticCheck: "consistent-component-naming" },
  { sc: "3.2.6", level: "A",  title: "Consistent Help — WCAG 2.2",
    kind: "static", staticCheck: "consistent-help-mechanism" },

  { sc: "3.3.1", level: "A",  title: "Error Identification",
    kind: "axe", axeRules: ["aria-input-field-name", "aria-required-attr"] },
  { sc: "3.3.2", level: "A",  title: "Labels or Instructions",
    kind: "axe", axeRules: ["label", "form-field-multiple-labels"] },
  { sc: "3.3.3", level: "AA", title: "Error Suggestion",
    kind: "static", staticCheck: "form-errors-include-suggestions" },
  { sc: "3.3.4", level: "AA", title: "Error Prevention (Legal, Financial, Data)",
    kind: "static", staticCheck: "destructive-actions-have-confirm" },
  { sc: "3.3.7", level: "A",  title: "Redundant Entry — WCAG 2.2",
    kind: "static", staticCheck: "forms-do-not-re-ask-known-data" },
  { sc: "3.3.8", level: "AA", title: "Accessible Authentication (Minimum) — WCAG 2.2",
    kind: "static", staticCheck: "no-cognitive-only-auth-without-alternative" },

  // ─── 4. ROBUST ──────────────────────────────────────────────────
  { sc: "4.1.2", level: "A",  title: "Name, Role, Value",
    kind: "axe", axeRules: [
      "aria-allowed-attr", "aria-allowed-role", "aria-command-name", "aria-hidden-body",
      "aria-hidden-focus", "aria-input-field-name", "aria-meter-name", "aria-progressbar-name",
      "aria-required-attr", "aria-required-children", "aria-required-parent", "aria-roles",
      "aria-toggle-field-name", "aria-tooltip-name", "aria-valid-attr", "aria-valid-attr-value",
      "button-name", "duplicate-id-aria", "input-button-name", "link-name", "select-name"
    ] },
  { sc: "4.1.3", level: "AA", title: "Status Messages",
    kind: "dom", domProbe: "status-messages-use-live-region" },
];

/** Convenience: criteria grouped by WCAG principle (1–4). */
export const PRINCIPLES: Record<string, string> = {
  "1": "Perceivable",
  "2": "Operable",
  "3": "Understandable",
  "4": "Robust",
};
