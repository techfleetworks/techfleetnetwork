/**
 * use-membership-realtime — keeps the user's profile in sync with backend
 * changes to membership state without manual reload.
 *
 * Triggers:
 *   1. On mount: fires a one-time gumroad-reconcile call to attach any
 *      pre-signup or webhook-missed Gumroad sales to the current user.
 *   2. Subscribes to postgres_changes on `profiles` filtered by user_id.
 *      When membership_tier or is_founding_member changes, calls
 *      `refreshProfile()` and shows a celebratory toast.
 *
 * Why a dedicated hook (not part of useAuth):
 *   - Reconciliation should run once per app session, not on every auth
 *     state change. The hook owns its own ran-flag to avoid duplicate calls.
 *   - Realtime channels need precise teardown to avoid memory leaks during
 *     hot module replacement. Co-locating with the page that needs it keeps
 *     subscription lifetimes short and predictable.
 */

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { createLogger } from "@/services/logger.service";

const log = createLogger("MembershipRealtime");

const TIER_LABEL: Record<string, string> = {
  starter: "Starter",
  community: "Community",
  professional: "Professional",
};

export function useMembershipRealtime() {
  const { user, profile, refreshProfile } = useAuth();
  const reconciledRef = useRef(false);
  const lastTierRef = useRef<string | null>(null);
  const lastFoundingRef = useRef<boolean | null>(null);

  // Track current state so the realtime callback can detect transitions.
  useEffect(() => {
    if (profile) {
      const tier = (profile as unknown as { membership_tier?: string })
        .membership_tier ?? null;
      const founding = Boolean(
        (profile as unknown as { is_founding_member?: boolean })
          .is_founding_member,
      );
      // Only seed on first sight — don't overwrite once realtime is live.
      if (lastTierRef.current === null) lastTierRef.current = tier;
      if (lastFoundingRef.current === null) lastFoundingRef.current = founding;
    }
  }, [profile]);

  // 1. One-time reconciliation on mount per session.
  useEffect(() => {
    if (!user || reconciledRef.current) return;
    reconciledRef.current = true;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "gumroad-reconcile",
          { body: {} },
        );
        if (error) {
          log.warn("reconcile", `Reconcile failed: ${error.message}`, {
            userId: user.id,
          });
          return;
        }
        if (data?.applied && data.applied > 0) {
          log.info(
            "reconcile",
            `Applied ${data.applied} pending sale(s) for user ${user.id}`,
            { userId: user.id, tier: data.tier },
          );
          await refreshProfile();
        }
      } catch (err) {
        log.warn(
          "reconcile",
          `Unexpected reconcile error: ${(err as Error).message}`,
          { userId: user.id },
        );
      }
    })();
  }, [user, refreshProfile]);

  // 2. Realtime subscription on profiles row.
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`profile-membership-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const next = payload.new as {
            membership_tier?: string;
            is_founding_member?: boolean;
          };
          const prevTier = lastTierRef.current;
          const prevFounding = lastFoundingRef.current;
          const newTier = next.membership_tier ?? null;
          const newFounding = Boolean(next.is_founding_member);

          const tierChanged = prevTier !== null && prevTier !== newTier;
          const foundingFlipped =
            prevFounding !== null && prevFounding !== newFounding;

          if (tierChanged || foundingFlipped) {
            log.info(
              "realtime",
              `Membership updated for user ${user.id}: ${prevTier} → ${newTier} (founding: ${newFounding})`,
              {
                userId: user.id,
                from: prevTier,
                to: newTier,
                founding: newFounding,
              },
            );

            const tierName = newTier ? TIER_LABEL[newTier] ?? newTier : "your tier";
            const message = newFounding
              ? `🎉 Welcome, Founding Member! Your ${tierName} access is live.`
              : `🎉 Your ${tierName} membership is now active.`;

            toast.success(message, {
              position: "top-center",
              duration: 6000,
            });

            lastTierRef.current = newTier;
            lastFoundingRef.current = newFounding;
            void refreshProfile();
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, refreshProfile]);
}
