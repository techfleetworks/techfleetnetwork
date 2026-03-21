import * as React from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  getFieldValidationState,
  validationBorderClass,
  type FieldValidationState,
} from "@/lib/form-validation";

interface ValidatedFieldProps {
  /** Field id — used for htmlFor on the label and aria-describedby */
  id?: string;
  /** Field label text */
  label: string;
  /** Whether the field is required */
  required?: boolean;
  /** Current error message (if any) */
  error?: string;
  /** Current field value — used to derive validation state */
  value?: string | string[] | boolean | number | null;
  /** Whether the field has been interacted with */
  touched?: boolean;
  /** Optional description below the label */
  description?: string;
  /** Optional override for validation state */
  validationState?: FieldValidationState;
  /** Additional class names on the wrapper */
  className?: string;
  /** The field element(s) */
  children: React.ReactNode;
}

/**
 * System-wide validated field wrapper.
 *
 * Provides consistent layout, labeling, error display, and validation
 * state borders for ALL form fields across the entire application.
 *
 * Usage:
 * ```tsx
 * <ValidatedField id="email" label="Email" required error={errors.email}
 *   value={email} touched={touched.email}>
 *   <Input id="email" value={email} onChange={...}
 *     className={validationBorderClass(getFieldValidationState(errors.email, email, touched.email))}
 *     aria-invalid={!!errors.email} />
 * </ValidatedField>
 * ```
 */
export function ValidatedField({
  id,
  label,
  required,
  error,
  value,
  touched = false,
  description,
  validationState: overrideState,
  className,
  children,
}: ValidatedFieldProps) {
  const state = overrideState ?? getFieldValidationState(error, value, touched);

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className={cn(state === "invalid" && "text-destructive")}>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>

      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      {children}

      {/* Inline error */}
      {state === "invalid" && error && (
        <p
          id={id ? `${id}-error` : undefined}
          className="text-sm text-destructive flex items-center gap-1"
          role="alert"
        >
          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}

      {/* Valid confirmation */}
      {state === "valid" && (
        <p className="text-xs text-success flex items-center gap-1" aria-live="polite">
          <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" /> Looks good
        </p>
      )}
    </div>
  );
}
