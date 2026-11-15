/**
 * Welcome Flow route-gate decision — pure, render-free, 100% branch-testable.
 *
 * The mandatory gate (flagless, §11.2) is a THREE-STATE decision (src/components/welcome/
 * CLAUDE.md): loading → wait (spinner); profile-read-failed → retry (NEVER redirect, NEVER
 * bypass — a redirect would loop, a bypass would skip the mandatory flow); loaded with a
 * null completion → redirect to /welcome. A completed user, or any allowlisted path, passes.
 *
 * AuthContext has no `profileError`, and `fetchProfile` leaves `profile` null on a failed /
 * timed-out first read while always setting `profileLoaded=true` (AuthContext.tsx fetchProfile
 * finally-block). So `profileLoaded && profile === null` is the only failed-read signal, and it
 * is treated as RETRY — which also safely covers the rare "authenticated user with no profile
 * row" (still never redirected into a loop, never bypassed). This keeps the gate entirely
 * outside the frozen auth layer: it only READS context state.
 */
import type { Profile } from "@/services/profile.service";

export type WelcomeGateDecision =
  | { kind: "wait" }
  | { kind: "retry" }
  | { kind: "redirect"; to: "/welcome" }
  | { kind: "allow" };

export interface WelcomeGateInput {
  /** AuthContext `loading` — auth bootstrap in flight. */
  loading: boolean;
  /** AuthContext `profileLoaded` — the profile fetch has settled (success OR failure). */
  profileLoaded: boolean;
  /**
   * AuthContext `profile` — null while unsettled, or after a failed/absent read. Typed as a
   * Pick of the real Profile (read-only shape); the gate only READS the completion fact, never
   * writes it (the single writer stays ProfileService.markWelcomeFlowComplete).
   */
  profile: Pick<Profile, "welcome_flow_completed_at"> | null;
  /** Current route path, to honor the allowlist. */
  pathname: string;
}

/**
 * Routes the gate must never redirect away from. `/welcome` itself is ProtectedRoute-wrapped
 * (App.tsx), so without this the gate would redirect /welcome → /welcome forever. Sign-out is
 * a function that lands on `/` (public, un-gated), so no sign-out route needs allowlisting.
 */
export const WELCOME_GATE_ALLOWLIST = ["/welcome"] as const;

function isAllowlisted(pathname: string): boolean {
  return WELCOME_GATE_ALLOWLIST.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

export function welcomeGateDecision(input: WelcomeGateInput): WelcomeGateDecision {
  // The flow itself (and any future sub-path) always passes — this is what prevents the
  // redirect loop. Checked FIRST so a loaded-but-failed read on /welcome still renders the flow.
  if (isAllowlisted(input.pathname)) return { kind: "allow" };

  // Still settling — show a spinner, never a decision.
  if (input.loading || !input.profileLoaded) return { kind: "wait" };

  // Settled but no profile = read failed (or no row). Retry only: never redirect (loop),
  // never bypass (skips the mandatory flow).
  if (input.profile === null) return { kind: "retry" };

  // Settled, profile present, completion not yet set → the mandatory flow.
  if (input.profile.welcome_flow_completed_at == null) {
    return { kind: "redirect", to: "/welcome" };
  }

  // Completed — pass through.
  return { kind: "allow" };
}
