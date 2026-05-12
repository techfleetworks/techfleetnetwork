/**
 * db-helpers — defensive wrappers for Supabase mutations.
 *
 * Why this exists:
 *   `supabase.from(...).update(...).eq(...)` returns `{ error: null }` even when
 *   RLS silently filters every row. The user sees a "saved" toast and the data
 *   vanishes on reload. This helper turns that silent zero-row UPDATE into a
 *   loud, actionable error.
 *
 * Usage:
 *   const q = supabase.from("classes").update(payload).eq("id", id).select("id");
 *   await assertWritten(await q, "class.update", { id });
 */

import { reportError } from "@/services/error-reporter.service";

export class WriteBlockedError extends Error {
  readonly label: string;
  readonly context: Record<string, unknown>;
  constructor(label: string, context: Record<string, unknown> = {}) {
    super(
      "We couldn't save your changes. Your session may have expired or you may not have access to this draft. Please refresh and try again."
    );
    this.name = "WriteBlockedError";
    this.label = label;
    this.context = context;
  }
}

interface MutationResult<T> {
  data: T[] | T | null;
  error: { message: string } | null;
}

/**
 * Throws WriteBlockedError when an UPDATE/INSERT/UPSERT affected 0 rows.
 * Pass the result of a mutation chained with `.select(...)`.
 */
export function assertWritten<T>(
  result: MutationResult<T>,
  label: string,
  context: Record<string, unknown> = {}
): T[] {
  if (result.error) throw new Error(result.error.message);
  const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
  if (rows.length === 0) {
    const err = new WriteBlockedError(label, context);
    // Fire-and-forget: surface to triage queue so we can fix the underlying RLS
    // policy without blocking the user-facing throw.
    try {
      reportError(err, label, { severity: "error" });
    } catch {
      /* never let reporting throw on top of the user error */
    }
    throw err;
  }
  return rows;
}
