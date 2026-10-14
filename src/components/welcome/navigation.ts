/**
 * Welcome Flow navigation — pure, render-free step mechanics (unit-testable in Node).
 *
 * Mirrors ProjectApplicationPage's stepper shape (§13) but as pure functions so the
 * bounds logic is proven without mounting React. `step` is a 0-based index into the
 * ordered step registry; `total` is the registry length (the live step count, not a
 * hardcoded 7 — the designed flow is 5 screens and grows PR by PR).
 */

/**
 * Shared DOM id for the active step's heading. The shell moves keyboard focus here on
 * every step change so screen-reader and keyboard users land on the new content, not the
 * top of the document (§12.2, WCAG 2.4.3). Only one step renders at a time, so a stable
 * id is safe.
 */
export const WELCOME_STEP_HEADING_ID = "welcome-step-heading";

/** Clamp an index into the valid range [0, total-1]; total<=0 collapses to 0. */
export function clampStep(step: number, total: number): number {
  if (total <= 0) return 0;
  if (!Number.isFinite(step)) return 0;
  return Math.min(Math.max(Math.trunc(step), 0), total - 1);
}

/** Back is disabled on the first step (§4.2 AC — "Back is disabled on the first step"). */
export function canGoBack(step: number): boolean {
  return step > 0;
}

/** Next is available on every step except the last built step. */
export function canGoNext(step: number, total: number): boolean {
  return step < total - 1;
}

/** The last step is where the finish CTA lives (the only place completion is written). */
export function isLastStep(step: number, total: number): boolean {
  return total > 0 && step === total - 1;
}

/** Next index, clamped — never advances past the last step. */
export function nextStep(step: number, total: number): number {
  return clampStep(step + 1, total);
}

/** Previous index, clamped — never below the first step. */
export function prevStep(step: number, total: number): number {
  return clampStep(step - 1, total);
}
