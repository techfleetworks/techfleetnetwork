/**
 * Consent-gated analytics loaders. NOTHING in this file may run unless the
 * user has consented to the relevant category. Imports outside
 * src/lib/consent/ are blocked by ESLint.
 */

import type { ConsentState } from "./manager";

const GA4_ID = "G-WYQKEKXSRR";
const CLARITY_ID = "we82xfqcup";

let ga4Loaded = false;
let clarityLoaded = false;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
  }
}

function ensureGtagStub() {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
  }
}

function loadGa4() {
  if (ga4Loaded || typeof document === "undefined") return;
  ga4Loaded = true;
  ensureGtagStub();
  // Consent Mode v2 — denied by default; we update below
  window.gtag!("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    functionality_storage: "denied",
    personalization_storage: "denied",
    security_storage: "granted",
    wait_for_update: 500,
  });
  window.gtag!("js", new Date());
  window.gtag!("config", GA4_ID, { send_page_view: false, anonymize_ip: true });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
  document.head.appendChild(s);
}

function loadClarity() {
  if (clarityLoaded || typeof document === "undefined") return;
  clarityLoaded = true;
  (function (c: Window, l: Document, a: string, r: string, i: string) {
    // @ts-expect-error untyped clarity bootstrap
    c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    const t = l.createElement(r) as HTMLScriptElement;
    t.async = true;
    t.src = "https://www.clarity.ms/tag/" + i;
    const y = l.getElementsByTagName(r)[0];
    y.parentNode!.insertBefore(t, y);
  })(window, document, "clarity", "script", CLARITY_ID);
}

/**
 * Apply the current consent state to all loaded trackers.
 * Safe to call repeatedly; each loader is idempotent.
 */
export function applyConsent(state: ConsentState) {
  ensureGtagStub();
  if (state.analytics && !state.gpc) {
    loadGa4();
    loadClarity();
    window.gtag?.("consent", "update", {
      analytics_storage: "granted",
      functionality_storage: state.functional ? "granted" : "denied",
      personalization_storage: state.functional ? "granted" : "denied",
    });
    window.clarity?.("consent", true);
  } else {
    window.gtag?.("consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    window.clarity?.("consent", false);
  }
}

export function trackPageView(path: string) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "page_view", { page_path: path });
}
