import { useEffect } from "react";
import { useLocation } from "react-router-dom";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const MEASUREMENT_ID = "G-WYQKEKXSRR";

/**
 * Sends a page_view to GA4 on every client-side route change.
 * GA initial config has send_page_view disabled to avoid double-counting.
 */
export function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    const path = location.pathname + location.search;
    window.gtag("event", "page_view", {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
      send_to: MEASUREMENT_ID,
    });
  }, [location.pathname, location.search]);

  return null;
}
