/**
 * Locale-aware formatting helpers.
 *
 * All user-facing date/number/currency rendering in the app should go through
 * these helpers rather than ad-hoc `toLocaleDateString()` calls. They read the
 * active i18next language so a runtime locale switch immediately propagates
 * to every formatted value, and they default to the user's resolved timezone
 * (Intl.DateTimeFormat().resolvedOptions().timeZone) so dates render the way
 * the user actually experiences them.
 *
 * WCAG / EN 301 549 tie-in: §3.1.1 Language of Page + culturally appropriate
 * presentation of numbers (e.g. comma vs period decimal separator) which is
 * called out in the Tech Fleet Accessibility Policy under "Localization".
 */
import i18n from "@/i18n";

function activeLocale(explicit?: string): string {
  if (explicit) return explicit;
  // i18n.language can be undefined in tests where init has not run.
  return i18n?.language || (typeof navigator !== "undefined" ? navigator.language : "en") || "en";
}

export function formatDate(
  value: Date | string | number | null | undefined,
  opts: Intl.DateTimeFormatOptions & { locale?: string } = {},
): string {
  if (value == null) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const { locale, ...rest } = opts;
  try {
    return new Intl.DateTimeFormat(activeLocale(locale), {
      year: "numeric",
      month: "short",
      day: "numeric",
      ...rest,
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function formatDateTime(
  value: Date | string | number | null | undefined,
  opts: Intl.DateTimeFormatOptions & { locale?: string } = {},
): string {
  return formatDate(value, {
    hour: "numeric",
    minute: "2-digit",
    ...opts,
  });
}

export function formatNumber(
  value: number | null | undefined,
  opts: Intl.NumberFormatOptions & { locale?: string } = {},
): string {
  if (value == null || Number.isNaN(value)) return "";
  const { locale, ...rest } = opts;
  try {
    return new Intl.NumberFormat(activeLocale(locale), rest).format(value);
  } catch {
    return String(value);
  }
}

export function formatCurrency(
  value: number | null | undefined,
  currency: string = "USD",
  opts: Intl.NumberFormatOptions & { locale?: string } = {},
): string {
  return formatNumber(value, { style: "currency", currency, ...opts });
}
