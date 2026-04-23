// Stable per-device identifier used by the admin passkey login gate so that
// verification persists for 30 days without re-prompting on every JWT refresh.
// Stored in localStorage; clearing site data resets it (which intentionally
// forces a fresh passkey verification — same security posture as a new device).

const KEY = "tfn.device_id.v1";

function generate(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id || id.length < 32) {
      id = generate();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // localStorage unavailable (private mode, SSR) — fall back to ephemeral id.
    // This means the gate will re-prompt every load in that environment, which
    // is the safe default.
    return generate();
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hash that is unique per (user, device) and stable across JWT refreshes. */
export async function getDeviceVerificationHash(userId: string): Promise<string> {
  return sha256Hex(`v1:${userId}:${getDeviceId()}`);
}
