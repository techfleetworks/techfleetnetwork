import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  welcomeGateDecision,
  type WelcomeGateDecision,
} from "@/components/welcome/gate-decision";

/**
 * The mandatory Welcome Flow route gate (flagless). A thin hook over the pure
 * `welcomeGateDecision` — it only READS auth context + the current path, so it stays outside
 * the frozen auth layer. Consumed by ProtectedRoute. All branch logic (and its proof) lives
 * in the pure function; this hook is just the wiring.
 */
export function useWelcomeGate(): WelcomeGateDecision {
  const { loading, profileLoaded, profile } = useAuth();
  const { pathname } = useLocation();
  return welcomeGateDecision({ loading, profileLoaded, profile, pathname });
}
