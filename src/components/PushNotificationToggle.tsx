/**
 * Push Notification Toggle
 *
 * A UI control that allows users to enable/disable Web Push notifications
 * on their current device. Guides users through permission states with
 * friendly, non-technical messaging.
 */

import { useState } from "react";
import { Bell, BellOff, Loader2, Info, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { usePushNotifications, type SubscribeResult } from "@/hooks/use-push-notifications";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function getBrowserName(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari")) return "Safari";
  return "your browser";
}

function getUnblockInstructions(): { steps: string[]; tip: string } {
  const browser = getBrowserName();
  switch (browser) {
    case "Chrome":
    case "Edge":
      return {
        steps: [
          `Look for the 🔒 lock icon (or tune icon) in your address bar and click it`,
          `Find "Notifications" in the dropdown`,
          `Change it from "Block" to "Allow"`,
          `Refresh this page, then try enabling push again`,
        ],
        tip: `In ${browser}, you can also go to Settings → Privacy and Security → Site Settings → Notifications to manage all sites.`,
      };
    case "Firefox":
      return {
        steps: [
          "Click the 🔒 lock icon in the address bar",
          'Find "Permissions" and click "More Information"',
          'Under Permissions, find Notifications and remove the "Block" setting',
          "Refresh the page and try again",
        ],
        tip: "You can also go to Settings → Privacy & Security → Permissions → Notifications.",
      };
    case "Safari":
      return {
        steps: [
          "Open Safari → Settings (or Preferences)",
          "Go to the Websites tab → Notifications",
          "Find this site and change it to Allow",
          "Refresh the page and try again",
        ],
        tip: "On iOS, make sure you've added this app to your Home Screen first.",
      };
    default:
      return {
        steps: [
          "Open your browser's settings or preferences",
          "Look for Notifications or Site Permissions",
          "Find this website and change notifications to Allow",
          "Refresh this page and try again",
        ],
        tip: "Check your browser's help documentation for specific steps.",
      };
  }
}

export function PushNotificationToggle() {
  const {
    isSupported,
    isSubscribed,
    permission,
    loading,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  const [showUnblockGuide, setShowUnblockGuide] = useState(false);

  if (!isSupported) {
    return (
      <div className="flex items-start gap-3 opacity-60">
        <BellOff className="h-4 w-4 mt-1 text-muted-foreground" aria-hidden="true" />
        <div>
          <Label className="text-sm leading-relaxed">
            Push notifications
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Push notifications aren't available on this browser. Try using a modern browser or install the app on your device.
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
      return;
    }

    // If permission was previously denied, show the guide instead of trying (which will silently fail)
    if (permission === "denied") {
      setShowUnblockGuide(true);
      return;
    }

    const result: SubscribeResult = await subscribe();

    switch (result) {
      case "granted":
        toast.success("Push notifications enabled! You'll receive alerts even when the app is closed.");
        break;
      case "dismissed":
        toast("No worries! You can enable push notifications anytime.", {
          description: "When your browser asks to send notifications, click \"Allow\" to turn them on.",
          duration: 6000,
        });
        break;
      case "denied":
        setShowUnblockGuide(true);
        break;
      case "no_sw":
        toast.error("Push notifications need the app to be installed. Try adding this site to your home screen first.", {
          duration: 6000,
        });
        break;
      case "unsupported":
        toast.error("Push notifications aren't supported on this browser.");
        break;
      case "error":
      default:
        toast.error("Something went wrong. Please try again in a moment.");
        break;
    }
  };

  const instructions = getUnblockInstructions();

  return (
    <>
      <div className="flex items-start gap-3">
        <Bell className="h-4 w-4 mt-1 text-muted-foreground" aria-hidden="true" />
        <div className="flex-1">
          <Label className="text-sm leading-relaxed">
            Push notifications on this device
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isSubscribed
              ? "You'll receive push notifications on this device even when the browser is closed."
              : permission === "denied"
                ? "Notifications are currently blocked. Click below for easy steps to turn them on."
                : "Enable to receive notifications on this device even when the app isn't open."}
          </p>
          <Button
            variant={isSubscribed ? "outline" : permission === "denied" ? "secondary" : "default"}
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
            ) : permission === "denied" ? (
              <Info className="h-3.5 w-3.5 mr-1.5" />
            ) : (
              <Bell className="h-3.5 w-3.5 mr-1.5" />
            )}
            {isSubscribed
              ? "Disable Push"
              : permission === "denied"
                ? "How to Enable"
                : "Enable Push"}
          </Button>
        </div>
      </div>

      <Dialog open={showUnblockGuide} onOpenChange={setShowUnblockGuide}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Enable Push Notifications
            </DialogTitle>
            <DialogDescription>
              Notifications were previously blocked for this site. Here's how to turn them back on in {getBrowserName()}:
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-3 my-2" role="list">
            {instructions.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-semibold" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="text-foreground pt-0.5">{step}</span>
              </li>
            ))}
          </ol>

          <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
            <ExternalLink className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>{instructions.tip}</span>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUnblockGuide(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
