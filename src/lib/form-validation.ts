import { toast } from "sonner";

/**
 * System-wide form validation utilities.
 * Every form field in the app should use these for consistent behavior:
 * - Red border + inline error when invalid
 * - Green border when valid (touched + no error)
 * - 30-second error toast at top of viewport
 * - Auto-scroll to first error
 */

export type FieldValidationState = "neutral" | "valid" | "invalid";

/**
 * Derive the validation state of a field based on whether it has been
 * interacted with, whether it has a value, and whether it has an error.
 */
export function getFieldValidationState(
  error: string | undefined,
  value: string | string[] | boolean | number | undefined | null,
  touched: boolean
): FieldValidationState {
  if (!touched) return "neutral";
  if (error) return "invalid";

  // Consider field valid if it has meaningful content
  const hasValue =
    value !== undefined &&
    value !== null &&
    value !== "" &&
    !(Array.isArray(value) && value.length === 0);

  return hasValue ? "valid" : "neutral";
}

/**
 * CSS border class for a field based on its validation state.
 * Use this on Input, Textarea, Select triggers, etc.
 */
export function validationBorderClass(state: FieldValidationState): string {
  switch (state) {
    case "invalid":
      return "border-destructive focus-visible:ring-destructive/40";
    case "valid":
      return "border-success focus-visible:ring-success/40";
    default:
      return "";
  }
}

/**
 * Optional per-field guidance — short, actionable copy explaining HOW to
 * resolve the error. Pair with `showFormErrors` so the toast tells users
 * not just *what* is wrong but *what to do about it* (Nielsen heuristic
 * #9 — Help users recognize, diagnose, and recover from errors).
 *
 * Example:
 *   showFormErrors(errors, labels, {
 *     email: "Use the format name@example.com.",
 *     country: "Open the country picker and type to search.",
 *   });
 */
export type FieldGuidance = Record<string, string>;

/**
 * Show a standardized error toast at the top of the viewport listing every
 * field error with its label, the validator message, and (when available)
 * concrete guidance on how to fix it.
 */
export function showFormErrors(
  errors: Record<string, string>,
  fieldLabels?: Record<string, string>,
  fieldGuidance?: FieldGuidance
): void {
  const entries = Object.entries(errors);
  const count = entries.length;
  if (count === 0) return;

  const lines = entries.map(([field, msg]) => {
    const label = fieldLabels?.[field] || humanizeFieldKey(field);
    const tip = fieldGuidance?.[field];
    return tip ? `• ${label}: ${msg} — ${tip}` : `• ${label}: ${msg}`;
  });

  toast.error(
    count === 1
      ? "1 field needs your attention before you can continue"
      : `${count} fields need your attention before you can continue`,
    {
      description: lines.join("\n"),
      duration: 30000,
      position: "top-center",
      // Sonner truncates long descriptions by default — explicitly allow
      // multi-line guidance to render fully.
      style: { whiteSpace: "pre-wrap" },
    }
  );
}

/**
 * Convert a fieldKey like "discordUsername" → "Discord username" so toasts
 * stay readable when no explicit label map is provided.
 */
function humanizeFieldKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Scroll to and focus the first invalid field on the page.
 *
 * Looks for `[aria-invalid="true"]` or `[data-validation="invalid"]`
 * within the optional container (defaults to the whole document).
 *
 * Works inside Radix portals / dialog scroll containers: we walk up
 * from the target to find the nearest scrollable ancestor and scroll
 * THAT, instead of relying on `el.scrollIntoView` which is no-op when
 * the field is inside an `overflow:auto` parent that isn't the viewport.
 */
export function scrollToFirstError(containerId?: string): void {
  // Defer one tick so the DOM has aria-invalid attributes applied after
  // the React state flush.
  requestAnimationFrame(() => {
    const root: ParentNode =
      (containerId ? document.getElementById(containerId) : null) ?? document;

    const el = root.querySelector(
      '[aria-invalid="true"], [data-validation="invalid"]'
    ) as HTMLElement | null;

    if (!el) return;

    const scrollContainer = findScrollableAncestor(el);
    if (scrollContainer && scrollContainer !== document.scrollingElement) {
      // Custom scroll container (e.g. dialog body): scroll it so the
      // field sits roughly in the middle.
      const containerRect = scrollContainer.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const offset =
        elRect.top - containerRect.top - containerRect.height / 2 + elRect.height / 2;
      scrollContainer.scrollBy({ top: offset, behavior: "smooth" });
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // Focus the field if focusable. Some fields wrap their input in
    // a button (Radix Combobox); the wrapper itself accepts focus.
    if (typeof (el as HTMLElement).focus === "function") {
      // Slight delay so smooth-scroll doesn't fight the focus jump.
      setTimeout(() => (el as HTMLElement).focus({ preventScroll: true }), 250);
    }
  });
}

function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    const isScrollable = overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
    if (isScrollable && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

