import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  bootstrapConsent,
  acceptAll,
  rejectNonEssential,
  setCategory,
  saveConsent,
  needsBanner,
  getAnonId,
  type ConsentState,
  type ConsentCategory,
} from "@/lib/consent/manager";
import { applyConsent } from "@/lib/consent/loadAnalytics";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Link } from "react-router-dom";

function persist(state: ConsentState, source: "banner" | "settings" | "gpc") {
  saveConsent(state);
  applyConsent(state);
  // Best-effort server log (non-blocking)
  try {
    supabase.functions.invoke("record-consent", {
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

let openExternalSetter: ((open: boolean) => void) | null = null;
export function openCookieSettings() {
  openExternalSetter?.(true);
}

export function CookieConsentBanner() {
  const [state, setState] = useState<ConsentState | null>(null);
  const [open, setOpen] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [country, setCountry] = useState<string | null>(null);

  // Bootstrap on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let detected: string | null = null;
      try {
        const { data } = await supabase.functions.invoke("geo-hint");
        detected = (data as { country?: string } | null)?.country ?? null;
      } catch { /* offline ok */ }
      if (cancelled) return;
      setCountry(detected);
      const next = bootstrapConsent(detected);
      setState(next);
      applyConsent(next);
      if (needsBanner(next)) setOpen(true);
      // If GPC just forced an opt-out on a stored decision, log it
      if (next.gpc && next.decidedAt && (!next.analytics && !next.marketing)) {
        persist(next, "gpc");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Allow footer link to reopen
  useEffect(() => {
    openExternalSetter = (v: boolean) => { setOpen(v); setCustomize(true); };
    return () => { openExternalSetter = null; };
  }, []);

  const update = useCallback((next: ConsentState, source: "banner" | "settings") => {
    setState(next);
    persist(next, source);
    setOpen(false);
    setCustomize(false);
  }, []);

  if (!state || !open) return null;

  const toggle = (cat: ConsentCategory, value: boolean) => {
    setState((prev) => prev ? setCategory(prev, cat, value) : prev);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-banner-title"
      aria-describedby="cookie-banner-desc"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-card shadow-2xl"
    >
      <div className="container-app py-4 sm:py-6">
        <div className="flex flex-col gap-4">
          <div>
            <h2 id="cookie-banner-title" className="text-base font-semibold">
              Cookies & your privacy
            </h2>
            <p id="cookie-banner-desc" className="mt-1 text-sm text-muted-foreground">
              We use strictly necessary cookies to keep this site running. With your
              permission we also use functional and analytics cookies to improve it.
              {state.gpc && (
                <span className="ml-1 text-foreground">
                  We detected a Global Privacy Control signal — analytics and
                  sale/share are off for this browser.
                </span>
              )}
              {" "}
              <Link to="/cookies" className="underline">Cookie Policy</Link>
              {" · "}
              <Link to="/privacy" className="underline">Privacy Policy</Link>
            </p>
          </div>

          {customize && (
            <fieldset className="grid gap-3 rounded-md border p-4">
              <legend className="px-1 text-sm font-medium">Categories</legend>
              <CategoryRow
                label="Strictly necessary"
                description="Required to sign in and keep the site secure. Always on."
                checked
                disabled
              />
              <CategoryRow
                label="Functional"
                description="Remembers your theme, language, and dashboard layout."
                checked={state.functional}
                onChange={(v) => toggle("functional", v)}
              />
              <CategoryRow
                label="Analytics"
                description="Anonymous usage data so we can improve the platform."
                checked={state.analytics}
                disabled={state.gpc}
                onChange={(v) => toggle("analytics", v)}
              />
              <CategoryRow
                label="Marketing"
                description="We do not run ads today. Off unless we ever do."
                checked={state.marketing}
                disabled={state.gpc}
                onChange={(v) => toggle("marketing", v)}
              />
              {country && (
                <p className="text-xs text-muted-foreground">
                  Detected region: <strong>{country}</strong> ({state.region === "opt_in" ? "opt-in" : "opt-out"} jurisdiction).
                  Cross-border transfers use Standard Contractual Clauses, the UK IDTA,
                  or the EU–U.S. Data Privacy Framework as applicable. Email
                  info@techfleet.network for a copy.
                </p>
              )}
            </fieldset>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {!customize && (
              <Button variant="outline" onClick={() => setCustomize(true)}>
                Customize
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => state && update(rejectNonEssential(state), customize ? "settings" : "banner")}
            >
              Reject non-essential
            </Button>
            {customize ? (
              <Button onClick={() => state && update({ ...state, decidedAt: new Date().toISOString() }, "settings")}>
                Save preferences
              </Button>
            ) : (
              <Button onClick={() => state && update(acceptAll(state), "banner")}>
                Accept all
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryRow({
  label, description, checked, disabled, onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={label}
      />
    </label>
  );
}
