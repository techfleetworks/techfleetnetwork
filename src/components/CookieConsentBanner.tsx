/**
 * CookieYes integration shim.
 *
 * The visible cookie banner is rendered by CookieYes (script tag in
 * index.html). This component renders no UI of its own; it exists to:
 *   1. Listen for CookieYes consent events (`cookieyes_consent_update` /
 *      `cookieyes_banner_load`).
 *   2. Translate CookieYes categories → our internal ConsentState.
 *   3. Forward to `applyConsent()` so GA4 / Clarity load only after the user
 *      grants analytics consent (and never when GPC is on).
 *   4. Best-effort POST to the `record-consent` edge function so we keep an
 *      auditable, server-side consent log (GDPR Art. 7(1) requires we can
 *      *prove* consent — CookieYes's own log is supplementary, not primary).
 *   5. Expose `openCookieSettings()` so footer / policy pages can re-open the
 *      preferences modal via CookieYes's `revisitCkyConsent()` API.
 *
 * If CookieYes is blocked (ad-blocker, network failure) we still honour GPC
 * and never load analytics — fail-closed.
 */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applyConsent } from "@/lib/consent/loadAnalytics";
import {
  bootstrapConsent,
  saveConsent,
  getAnonId,
  detectGpc,
  type ConsentState,
} from "@/lib/consent/manager";

type CkyCategory = "necessary" | "functional" | "analytics" | "performance" | "advertisement" | "other";

interface CkyConsentDetail {
  accepted?: CkyCategory[];
  rejected?: CkyCategory[];
  isUserActionCompleted?: boolean;
}

declare global {
  interface Window {
    revisitCkyConsent?: () => void;
    getCkyConsent?: () => { categories?: Record<CkyCategory, boolean> };
  }
}

export function openCookieSettings() {
  if (typeof window === "undefined") return;
  if (typeof window.revisitCkyConsent === "function") {
    window.revisitCkyConsent();
  } else {
    // CookieYes hasn't loaded (blocked). Surface a graceful fallback.
    // eslint-disable-next-line no-console
    console.warn("[consent] CookieYes not available — opening fallback /cookies page");
    window.location.assign("/cookies");
  }
}

function fromCkyDetail(detail: CkyConsentDetail, prev: ConsentState): ConsentState {
  const accepted = new Set(detail.accepted ?? []);
  const gpc = detectGpc();
  const analytics = !gpc && (accepted.has("analytics") || accepted.has("performance"));
  const functional = accepted.has("functional");
  const marketing = !gpc && accepted.has("advertisement");
  return {
    ...prev,
    functional,
    analytics,
    marketing,
    gpc,
    decidedAt: new Date().toISOString(),
  };
}

function persist(state: ConsentState, source: "cookieyes" | "gpc") {
  saveConsent(state);
  applyConsent(state);
  try {
    void supabase.functions.invoke("record-consent", {
      body: {
        anon_id: getAnonId(),
        categories: {
          strictly_necessary: true,
          functional: state.functional,
          analytics: state.analytics,
          marketing: state.marketing,
        },
        gpc_signal: state.gpc,
        policy_version: state.policyVersion,
        source,
      },
    });
  } catch { /* offline ok */ }
}

export function CookieConsentBanner() {
  useEffect(() => {
    // 1. Bootstrap with stored consent (or safe defaults). This applies GPC
    //    immediately so analytics never fire pre-event even if CookieYes is slow.
    const initial = bootstrapConsent(null);
    applyConsent(initial);
    if (initial.gpc && (initial.analytics || initial.marketing)) {
      persist({ ...initial, analytics: false, marketing: false }, "gpc");
    }

    // 2. Subscribe to CookieYes events.
    const onConsent = (e: Event) => {
      const detail = (e as CustomEvent<CkyConsentDetail>).detail || {};
      const next = fromCkyDetail(detail, initial);
      persist(next, "cookieyes");
    };
    window.addEventListener("cookieyes_consent_update", onConsent as EventListener);
    window.addEventListener("cookieyes_banner_load", onConsent as EventListener);
    return () => {
      window.removeEventListener("cookieyes_consent_update", onConsent as EventListener);
      window.removeEventListener("cookieyes_banner_load", onConsent as EventListener);
    };
  }, []);

  return null;
}
