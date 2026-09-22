import { useAuth } from "@/contexts/AuthContext";
import { useSessionKeepalive } from "@/hooks/use-session-keepalive";

/**
 * Mount-once; renders nothing. Keeps a signed-in member's access token refreshed
 * so an open, active tab is never signed out mid-work when the 1-hour token
 * expires (ADR-0054). Sibling to `IdleTimeoutGuard`: this renews the token while
 * the tab is open; that one signs the member out after real inactivity.
 */
export function SessionKeepalive() {
  const { user } = useAuth();
  useSessionKeepalive(!!user);
  return null;
}
