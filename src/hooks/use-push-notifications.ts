/**
 * Hook for managing Web Push notification subscriptions.
 * Provides subscribe/unsubscribe actions and current subscription state.
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { PushSubscriptionService } from "@/services/push-subscription.service";

export type SubscribeResult = "granted" | "denied" | "dismissed" | "unsupported" | "no_sw" | "error";

export function usePushNotifications() {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsSupported(PushSubscriptionService.isSupported());
    setPermission(PushSubscriptionService.getPermission());

    PushSubscriptionService.isSubscribed().then(setIsSubscribed);
  }, []);

  const subscribe = useCallback(async (): Promise<SubscribeResult> => {
    if (!user) return "error";
    setLoading(true);
    try {
      const result = await PushSubscriptionService.subscribe(user.id);
      setIsSubscribed(result === "granted");
      setPermission(PushSubscriptionService.getPermission());
      return result;
    } finally {
      setLoading(false);
    }
  }, [user]);

  const unsubscribe = useCallback(async () => {
    if (!user) return false;
    setLoading(true);
    try {
      const result = await PushSubscriptionService.unsubscribe(user.id);
      if (result) setIsSubscribed(false);
      return result;
    } finally {
      setLoading(false);
    }
  }, [user]);

  return {
    isSupported,
    isSubscribed,
    permission,
    loading,
    subscribe,
    unsubscribe,
  };
}
