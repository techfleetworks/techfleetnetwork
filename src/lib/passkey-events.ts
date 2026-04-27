export const PASSKEY_ENROLLMENT_CHANGED_EVENT = "tfn:passkey-enrollment-changed";

export function notifyPasskeyEnrollmentChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PASSKEY_ENROLLMENT_CHANGED_EVENT));
}