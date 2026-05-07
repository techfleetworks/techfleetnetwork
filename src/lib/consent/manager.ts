/**
 * First-party consent manager.
 *
 * Categories:
 *   strictly_necessary  always true
 *   functional          off by default in opt-in regions
 *   analytics           off by default in opt-in regions
 *   marketing           off by default everywhere
 *
 * GDPR/UK/CH/BR/CA-Quebec/ZA/PIPL/etc. = OPT-IN regions: nothing non-essential
 * loads until the user clicks Accept (or Customize → Save).
 *
 * Other regions = OPT-OUT: defaults are on, but the banner still shows so the
 * user can withdraw, and `Sec-GPC: 1` / `navigator.globalPrivacyControl === true`
 * forces analytics + marketing OFF.
 */

import { POLICY_LAST_UPDATED } from "@/lib/policies";

export type ConsentCategory =
  | "strictly_necessary"
  | "functional"
  | "analytics"
  | "marketing";

export interface ConsentState {
  strictly_necessary: true;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  gpc: boolean;
  region: "opt_in" | "opt_out" | "unknown";
  countryCode: string | null;
  policyVersion: string;
  decidedAt: string | null; // ISO; null = banner still required
}

const STORAGE_KEY = "tfn.consent.v1";
const ANON_KEY = "tfn.anon_id.v1";

const OPT_IN_COUNTRIES = new Set<string>([
  // EEA
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IS","IE",
  "IT","LV","LI","LT","LU","MT","NL","NO","PL","PT","RO","SK","SI","ES","SE",
  // UK + CH
  "GB","CH",
  // Brazil, Canada (Quebec specifically; we treat all CA as opt-in for safety)
  "BR","CA",
  // South Africa, South Korea, China, Türkiye, KSA, UAE, India (DPDP)
  "ZA","KR","CN","TR","SA","AE","IN",
]);

function isBrowser() {
  return typeof window !== "undefined";
}

export function detectGpc(): boolean {
  if (!isBrowser()) return false;
  // @ts-expect-error: globalPrivacyControl is non-standard but widely supported
  return Boolean(navigator?.globalPrivacyControl);
}

export function getAnonId(): string {
  if (!isBrowser()) return "ssr";
  let v = localStorage.getItem(ANON_KEY);
  if (!v) {
    v = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
    try { localStorage.setItem(ANON_KEY, v); } catch {/* private mode */}
  }
  return v;
}

export function regionFromCountry(country: string | null): ConsentState["region"] {
  if (!country) return "unknown";
  return OPT_IN_COUNTRIES.has(country.toUpperCase()) ? "opt_in" : "opt_out";
}

function defaultState(country: string | null, gpc: boolean): ConsentState {
  const region = regionFromCountry(country);
  // Opt-in: everything off until user decides. Opt-out: defaults on, but GPC forces off.
  const allowNonEssential = region === "opt_out" && !gpc;
  return {
    strictly_necessary: true,
    functional: allowNonEssential,
    analytics: allowNonEssential,
    marketing: false, // never on by default — we don't run ads, so consent is required if we ever do
    gpc,
    region,
    countryCode: country,
    policyVersion: POLICY_LAST_UPDATED,
    decidedAt: null,
  };
}

export function loadConsent(): ConsentState | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    // If policy version changed, force re-consent
    if (parsed.policyVersion !== POLICY_LAST_UPDATED) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveConsent(state: ConsentState) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {/* private mode */}
  window.dispatchEvent(new CustomEvent("tfn:consent-changed", { detail: state }));
}

export function bootstrapConsent(country: string | null): ConsentState {
  const gpc = detectGpc();
  const stored = loadConsent();
  if (stored) {
    // Re-apply GPC every load: even if user accepted analytics earlier on a non-GPC
    // browser, a later GPC signal must force opt-out per CCPA/CPRA regulator guidance.
    if (gpc && (stored.analytics || stored.marketing)) {
      const next: ConsentState = { ...stored, analytics: false, marketing: false, gpc: true };
      saveConsent(next);
      return next;
    }
    return { ...stored, gpc };
  }
  return defaultState(country, gpc);
}

export function acceptAll(prev: ConsentState): ConsentState {
  // GPC always wins
  if (prev.gpc) return rejectNonEssential(prev);
  return {
    ...prev,
    functional: true,
    analytics: true,
    marketing: true,
    decidedAt: new Date().toISOString(),
  };
}

export function rejectNonEssential(prev: ConsentState): ConsentState {
  return {
    ...prev,
    functional: false,
    analytics: false,
    marketing: false,
    decidedAt: new Date().toISOString(),
  };
}

export function setCategory(prev: ConsentState, cat: ConsentCategory, value: boolean): ConsentState {
  if (cat === "strictly_necessary") return prev;
  if (prev.gpc && (cat === "analytics" || cat === "marketing") && value) return prev;
  return { ...prev, [cat]: value, decidedAt: new Date().toISOString() };
}

export function needsBanner(state: ConsentState): boolean {
  return state.decidedAt === null;
}
