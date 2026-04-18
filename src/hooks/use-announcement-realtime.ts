/**
 * Announcement realtime hook — DEPRECATED, kept as a no-op for backwards compat.
 *
 * Why this is now a no-op (audit 2026-04-18):
 * At 10k concurrent users, an admin INSERT into `announcements` would fan
 * out to 10k WebSocket frames in <1s, blowing past the Realtime quota
 * (~2,500 msg/s on Team) and triggering 20k thundering-herd refetches
 * (each client invalidates 2 React Query keys).
 *
 * The existing `useLatestAnnouncements` hook already polls every 60s
 * (240s when the tab is hidden). That is now the sole delivery channel —
 * users see new announcements within 0–60s instead of instantly, which is
 * an acceptable trade-off for stability at scale.
 *
 * The hook is left exported (and still called from AppLayout) so that
 * removing the file doesn't ripple through call sites or tests. Re-enabling
 * realtime should not happen without first introducing jittered, scoped
 * subscriptions and a server-side fanout job (see `notify_project_opening`
 * two-step pattern).
 */
export function useAnnouncementRealtime(): void {
  // Intentionally empty. See file header.
}
