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
 * Show a standardized error toast at the top of the viewport for 30 seconds
 * listing all field errors with labels and resolution guidance.
 */
export function showFormErrors(
  errors: Record<string, string>,
  fieldLabels?: Record<string, string>
): void {
  const labels = Object.entries(errors).map(([field, msg]) => {
    const label = fieldLabels?.[field] || field;
    return `${label}: ${msg}`;
  });

  toast.error(
    `Please fix ${Object.keys(errors).length} ${Object.keys(errors).length === 1 ? "error" : "errors"} to continue`,
    {
      description: labels.join("\n"),
      duration: 30000,
      position: "top-center",
    }
  );
}

/**
 * Scroll to and focus the first invalid field on the page.
 * Looks for [aria-invalid="true"] or [data-validation="invalid"].
 */
export function scrollToFirstError(containerId?: string): void {
  setTimeout(() => {
    const container = containerId
      ? document.getElementById(containerId)
      : document;
    if (!container) return;

    const el = (container as Element | Document).querySelector(
      '[aria-invalid="true"], [data-validation="invalid"]'
    ) as HTMLElement | null;

    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      if ("focus" in el) el.focus();
    }
  }, 100);
}
