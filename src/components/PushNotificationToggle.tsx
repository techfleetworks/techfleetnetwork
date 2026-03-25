/**
 * Push Notification Toggle
 *
 * A UI control that allows users to enable/disable Web Push notifications
 * on their current device. Shows permission state and subscription status.
 */

import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { toast } from "sonner";

export function PushNotificationToggle() {
  const {
    isSupported,
    isSubscribed,
    permission,
    loading,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  if (!isSupported) {
    return (
      <div className="flex items-start gap-3 opacity-60">
        <BellOff className="h-4 w-4 mt-1 text-muted-foreground" aria-hidden="true" />
        <div>
          <Label className="text-sm leading-relaxed">
            Push notifications
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Push notifications are not supported on this browser. Try using a modern browser or install the app on your device.
          </p>
        </div>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className="flex items-start gap-3 opacity-60">
        <BellOff className="h-4 w-4 mt-1 text-destructive" aria-hidden="true" />
        <div>
          <Label className="text-sm leading-relaxed">
            Push notifications blocked
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            You've blocked notifications for this site. To enable them, update your browser's notification permissions for this site.
          </p>
        </div>
      </div>
    );
  }

  const handleToggle = async () => {
    if (isSubscribed) {
      const success = await unsubscribe();
      if (success) {
        toast.success("Push notifications disabled on this device.");
      } else {
        toast.error("Failed to disable push notifications.");
      }
    } else {
      const success = await subscribe();
      if (success) {
        toast.success("Push notifications enabled! You'll receive alerts even when the app is closed.");
      } else {
        toast.error("Could not enable push notifications. Please check your browser permissions.");
      }
    }
  };

  return (
    <div className="flex items-start gap-3">
      <Bell className="h-4 w-4 mt-1 text-muted-foreground" aria-hidden="true" />
      <div className="flex-1">
        <Label className="text-sm leading-relaxed">
          Push notifications on this device
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isSubscribed
            ? "You'll receive push notifications on this device even when the browser is closed."
            : "Enable to receive notifications on this device even when the app isn't open."}
        </p>
        <Button
          variant={isSubscribed ? "outline" : "default"}
          size="sm"
          className="mt-2"
          onClick={handleToggle}
          disabled={loading}
          aria-label={isSubscribed ? "Disable push notifications" : "Enable push notifications"}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : isSubscribed ? (
            <BellOff className="h-3.5 w-3.5 mr-1.5" />
          ) : (
            <Bell className="h-3.5 w-3.5 mr-1.5" />
          )}
          {isSubscribed ? "Disable Push" : "Enable Push"}
        </Button>
      </div>
    </div>
  );
}
