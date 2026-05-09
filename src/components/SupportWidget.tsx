import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { reportError } from "@/services/error-reporter.service";

declare global {
  interface Window {
    chatwootSDK?: {
      run: (opts: { websiteToken: string; baseUrl: string }) => void;
    };
    $chatwoot?: {
      setUser: (id: string, attrs: Record<string, unknown>) => void;
      setCustomAttributes?: (attrs: Record<string, unknown>) => void;
      reset?: () => void;
      toggle?: (state?: "open" | "close") => void;
    };
  }
}

/**
 * SupportWidget — embeds the self-hosted Chatwoot widget for signed-in users
 * with verified identity (HMAC-signed identifier_hash from chatwoot-widget-token).
 *
 * - Skips rendering if Chatwoot env is not configured (returns 503 on token call).
 * - Skips on signed-out users.
 * - Loads the SDK script once; subsequent route changes only call setUser.
 * - Honors prefers-reduced-motion via Chatwoot's own setting (no extra animations injected).
 */
export function SupportWidget() {
  const { user } = useAuth();
  const initializedRef = useRef(false);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      // Sign-out: tear down identity if already initialized.
      if (window.$chatwoot?.reset) {
        try { window.$chatwoot.reset(); } catch { /* ignore */ }
      }
      userIdRef.current = null;
      return;
    }
    if (userIdRef.current === user.id) return;

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("chatwoot-widget-token", {
          body: {},
        });
        if (cancelled) return;
        if (error || !data?.baseUrl || !data?.websiteToken) {
          // Not configured yet — silent. reportError as info so System Health sees it once.
          if (error && error.message && !/chatwoot_not_configured|503/.test(error.message)) {
            reportError(error, { source: "SupportWidget.token", severity: "warn" });
          }
          return;
        }

        const baseUrl: string = data.baseUrl;
        const websiteToken: string = data.websiteToken;

        // Inject the SDK once
        if (!initializedRef.current) {
          await new Promise<void>((resolve, reject) => {
            const existing = document.querySelector<HTMLScriptElement>("script[data-chatwoot-sdk]");
            if (existing) { resolve(); return; }
            const s = document.createElement("script");
            s.src = `${baseUrl.replace(/\/$/, "")}/packs/js/sdk.js`;
            s.async = true;
            s.defer = true;
            s.dataset.chatwootSdk = "1";
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("chatwoot_sdk_load_failed"));
            document.head.appendChild(s);
          });
          window.chatwootSDK?.run({ websiteToken, baseUrl });
          initializedRef.current = true;
        }

        // Wait for $chatwoot to be ready, then setUser.
        const tryAttachIdentity = () => {
          if (window.$chatwoot?.setUser) {
            window.$chatwoot.setUser(data.identifier, {
              name: data.name,
              email: data.email ?? undefined,
              avatar_url: data.avatar_url ?? undefined,
              identifier_hash: data.identifier_hash,
            });
            if (window.$chatwoot.setCustomAttributes && data.attributes) {
              window.$chatwoot.setCustomAttributes(data.attributes);
            }
            userIdRef.current = data.identifier;
          } else {
            window.addEventListener("chatwoot:ready", tryAttachIdentity, { once: true });
          }
        };
        tryAttachIdentity();
      } catch (err) {
        reportError(err, { source: "SupportWidget.init", severity: "warn" });
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  return null;
}

/** Imperative helper to open the widget (used by "Report a bug" button). */
export function openSupportWidget() {
  if (window.$chatwoot?.toggle) {
    window.$chatwoot.toggle("open");
  }
}
