/**
 * i18n bootstrap — any language on Earth.
 *
 * Strategy:
 *  1. Static bundles in /public/locales/{lng}/{ns}.json for vetted languages.
 *  2. Unknown BCP-47 tags fall back to AI-translated bundle served by the
 *     `translate-bundle` edge function (cached in i18n_translations table).
 *  3. Final fallback: English.
 *
 * Detection order: ?lang= → cookie/localStorage tf_lang → navigator → htmlTag.
 *
 * Side-effects on language change: <html lang> and <html dir> are updated, and
 * a CustomEvent("tf:lang") is dispatched so non-React surfaces (toasts, PDF
 * generators, etc.) can react.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import HttpBackend from "i18next-http-backend";

import enCommon from "./locales/en/common.json";

export const RTL_LANGS = new Set(["ar", "he", "fa", "ur", "ps", "sd", "yi"]);
export const STATIC_LOCALES = ["en"] as const;
export const SUPPORTED_NAMESPACES = ["common"] as const;
export const FALLBACK_LOCALE = "en";

/** Returns "ltr" | "rtl" for any BCP-47 tag, looking only at the primary subtag. */
export function dirFor(lang: string): "ltr" | "rtl" {
  const primary = (lang || "en").toLowerCase().split("-")[0];
  return RTL_LANGS.has(primary) ? "rtl" : "ltr";
}

void i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: FALLBACK_LOCALE,
    supportedLngs: false, // accept any BCP-47 tag — fallback handled per-load
    ns: ["common"],
    defaultNS: "common",
    load: "currentOnly",
    interpolation: { escapeValue: false }, // React handles escaping
    detection: {
      order: ["querystring", "localStorage", "navigator", "htmlTag"],
      lookupQuerystring: "lang",
      lookupLocalStorage: "tf_lang",
      caches: ["localStorage"],
    },
    backend: {
      loadPath: (lngs: string[], namespaces: string[]) => {
        const lng = lngs[0];
        const ns = namespaces[0];
        // Static bundles served from /public/locales/. If absent, the HTTP
        // backend will 404 and i18next falls back to the bundled English
        // resources we register below — meanwhile the language switcher
        // optimistically requests the AI fallback (see ensureLocale()).
        return `/locales/${lng}/${ns}.json`;
      },
    },
    resources: {
      en: { common: enCommon },
    },
    react: { useSuspense: false },
  });

// Apply <html lang> + <html dir> on every change, and broadcast.
function applyDocumentLang(lng: string) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lng || FALLBACK_LOCALE;
  document.documentElement.dir = dirFor(lng);
  document.dispatchEvent(new CustomEvent("tf:lang", { detail: { lang: lng } }));
}
applyDocumentLang(i18n.language || FALLBACK_LOCALE);
i18n.on("languageChanged", applyDocumentLang);

/**
 * Ensure a locale's bundle is loaded. If the static file 404s, ask the
 * `translate-bundle` edge function for an AI-translated bundle and inject it
 * directly so subsequent t() calls resolve.
 *
 * Returns true when usable bundle is present (vetted OR machine-translated).
 */
export async function ensureLocale(lng: string, ns: string = "common"): Promise<boolean> {
  if (!lng || lng === FALLBACK_LOCALE) return true;
  if (i18n.hasResourceBundle(lng, ns)) return true;
  try {
    await i18n.loadLanguages(lng);
    if (i18n.hasResourceBundle(lng, ns)) return true;
  } catch {
    /* fall through to AI fallback */
  }
  // AI fallback. Lazy import to avoid pulling supabase into the i18n entry.
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.functions.invoke("translate-bundle", {
      body: { locale: lng, namespace: ns },
    });
    if (error || !data?.bundle) return false;
    i18n.addResourceBundle(lng, ns, data.bundle, true, true);
    return true;
  } catch {
    return false;
  }
}

export default i18n;
