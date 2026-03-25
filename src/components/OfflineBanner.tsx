import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Full-screen offline overlay shown when the browser loses connectivity.
 * Mirrors the branded offline.html design using Tailwind semantic tokens.
 * Automatically dismisses when the connection is restored.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background p-6"
    >
      <div className="text-center max-w-md">
        {/* Logo */}
        <div className="mx-auto mb-8 w-20 h-20 rounded-xl bg-card border border-border p-3">
          <img
            src="/tech-fleet-logo.svg"
            alt="Tech Fleet"
            className="w-full h-full"
          />
        </div>

        <WifiOff className="mx-auto mb-4 h-12 w-12 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-foreground mb-2">You're Offline</h1>
        <p className="text-muted-foreground leading-relaxed mb-6">
          It looks like you've lost your internet connection. Some features may
          be unavailable until you're back online.
        </p>

        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          ↻ Try Again
        </button>

        <div className="mt-10 text-left bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            While you wait
          </h2>
          <ul className="space-y-2 text-muted-foreground text-sm">
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold" aria-hidden="true">•</span>
              Check your Wi-Fi or mobile data connection
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold" aria-hidden="true">•</span>
              Try moving closer to your router
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold" aria-hidden="true">•</span>
              Pages you've visited before may still be cached
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
