// Centralized policy document links + server-side acknowledgment helper.
import { supabase } from "@/integrations/supabase/client";

export const POLICY_LAST_UPDATED = "May 7, 2026";
export const CURRENT_POLICY_VERSION = "2026-05-07";

export type PolicyKey =
  | "terms-and-conditions"
  | "terms-of-use"
  | "privacy"
  | "cookies"
  | "accessibility"
  | "code-of-conduct";

export interface PolicyLink {
  key: PolicyKey;
  label: string;
  href: string;
}

export const POLICIES: PolicyLink[] = [
  { key: "terms-and-conditions", label: "Terms & Conditions", href: "/terms" },
  { key: "terms-of-use", label: "Terms of Use", href: "/terms-of-use" },
  { key: "privacy", label: "Privacy Policy", href: "/privacy" },
  { key: "cookies", label: "Cookie Policy", href: "/cookies" },
  { key: "accessibility", label: "Accessibility Policy", href: "/accessibility" },
  { key: "code-of-conduct", label: "Code of Conduct", href: "/code-of-conduct" },
];

const ANON_KEY_STORAGE = "tfn.anon_id";

function anonId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY_STORAGE);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ANON_KEY_STORAGE, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

interface AckOptions {
  policies?: PolicyKey[];
  electronicCommsConsent?: boolean;
  version?: string;
}

/**
 * Server-side audit of policy acceptance (T&C §23 / ToU §19). Falls back to
 * a localStorage marker if the network request fails so we can replay it on
 * next sign-in.
 */
export async function recordPolicyAcknowledgment(
  method: "checkbox" | "google-oauth" | "re-accept" | "registration",
  opts: AckOptions = {},
): Promise<{ ok: boolean }> {
  const policies = opts.policies ?? (POLICIES.map((p) => p.key) as PolicyKey[]);
  const version = opts.version ?? CURRENT_POLICY_VERSION;
  const electronicComms = !!opts.electronicCommsConsent;
  const payload = {
    policy_keys: policies,
    version,
    method,
    electronic_comms: electronicComms,
    anon_id: anonId(),
  };
  try {
    const { error } = await supabase.functions.invoke("record-policy-acknowledgment", {
      body: payload,
    });
    if (error) throw error;
    try {
      localStorage.removeItem("tfn.policy_ack_pending");
    } catch { /* noop */ }
    return { ok: true };
  } catch {
    try {
      localStorage.setItem(
        "tfn.policy_ack_pending",
        JSON.stringify({ ...payload, queuedAt: new Date().toISOString() }),
      );
    } catch { /* noop */ }
    return { ok: false };
  }
}

/** Replay any queued acknowledgment after a sign-in or network recovery. */
export async function flushPendingPolicyAcknowledgment(): Promise<void> {
  try {
    const raw = localStorage.getItem("tfn.policy_ack_pending");
    if (!raw) return;
    const queued = JSON.parse(raw);
    const { error } = await supabase.functions.invoke("record-policy-acknowledgment", {
      body: queued,
    });
    if (!error) localStorage.removeItem("tfn.policy_ack_pending");
  } catch { /* noop */ }
}
