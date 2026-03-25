/**
 * Push Subscription Service
 *
 * Manages Web Push notification subscriptions:
 * - Requesting notification permission
 * - Subscribing/unsubscribing the browser
 * - Syncing subscriptions with the database
 */

import { supabase } from "@/integrations/supabase/client";

/** Base64URL-encoded VAPID public key — injected at build time or fetched from env */
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

/** Convert a base64url string to a Uint8Array (for applicationServerKey) */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export class PushSubscriptionService {
  /** Check if the browser supports push notifications */
  static isSupported(): boolean {
    return (
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      !!VAPID_PUBLIC_KEY
    );
  }

  /** Get the current notification permission state */
  static getPermission(): NotificationPermission {
    if (!("Notification" in window)) return "denied";
    return Notification.permission;
  }

  /** Request notification permission from the user */
  static async requestPermission(): Promise<NotificationPermission> {
    if (!("Notification" in window)) return "denied";
    return Notification.requestPermission();
  }

  /**
   * Subscribe this browser/device to push notifications and save to DB.
   * Returns true on success.
   */
  static async subscribe(userId: string): Promise<boolean> {
    if (!this.isSupported()) return false;

    const permission = await this.requestPermission();
    if (permission !== "granted") return false;

    try {
      const registration = await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
      });

      const json = subscription.toJSON();
      const endpoint = json.endpoint!;
      const p256dh = json.keys?.p256dh ?? "";
      const auth = json.keys?.auth ?? "";

      // Upsert to database (unique on user_id + endpoint)
      const { error } = await supabase.from("push_subscriptions").upsert(
        { user_id: userId, endpoint, p256dh, auth },
        { onConflict: "user_id,endpoint" },
      );

      if (error) {
        console.error("Failed to save push subscription:", error.message);
        return false;
      }

      return true;
    } catch (err) {
      console.error("Push subscribe error:", err);
      return false;
    }
  }

  /** Unsubscribe this browser/device from push notifications */
  static async unsubscribe(userId: string): Promise<boolean> {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        // Remove from database
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", userId)
          .eq("endpoint", endpoint);
      }

      return true;
    } catch (err) {
      console.error("Push unsubscribe error:", err);
      return false;
    }
  }

  /** Check if the current device already has an active push subscription */
  static async isSubscribed(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      return !!subscription;
    } catch {
      return false;
    }
  }
}
