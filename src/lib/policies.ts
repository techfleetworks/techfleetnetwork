// Centralized policy document links. Files live in /public/policies/.
// Update lastUpdated when documents are republished.
export const POLICY_LAST_UPDATED = "May 7, 2026";

export interface PolicyLink {
  key: "terms-and-conditions" | "terms-of-use" | "privacy" | "cookies";
  label: string;
  href: string;
}

export const POLICIES: PolicyLink[] = [
  { key: "terms-and-conditions", label: "Terms & Conditions", href: "/policies/Terms-and-Conditions.docx" },
  { key: "terms-of-use", label: "Terms of Use", href: "/policies/Terms-of-Use.docx" },
  { key: "privacy", label: "Privacy Policy", href: "/policies/Privacy-Policy.docx" },
  { key: "cookies", label: "Cookie Policy", href: "/policies/Cookie-Policy.docx" },
];

/**
 * Records that the current user (or anonymous visitor) acknowledged the
 * four platform policies. Stored locally for client-side audit; the
 * server-side audit hook should also be invoked at registration time.
 */
export function recordPolicyAcknowledgment(method: "checkbox" | "google-oauth") {
  try {
    const payload = {
      method,
      acknowledgedAt: new Date().toISOString(),
      policiesVersion: POLICY_LAST_UPDATED,
      policies: POLICIES.map((p) => p.key),
    };
    localStorage.setItem("tfn.policy_ack", JSON.stringify(payload));
  } catch {
    // Storage unavailable — non-fatal; server-side acknowledgment still applies.
  }
}
