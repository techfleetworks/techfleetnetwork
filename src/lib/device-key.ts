/**
 * Cryptographic device binding for the admin MFA "30-day per-device trust"
 * feature. Replaces the previous random-token-in-localStorage scheme, which
 * was vulnerable to theft via XSS or storage exfiltration.
 *
 * How it works
 * ------------
 *  1. On first use, we generate an ECDSA P-256 keypair via WebCrypto.
 *     The private key is created with `extractable: false`, which means
 *     **no JavaScript on this page (or any later page) can ever read its
 *     bytes** — not malicious XSS, not browser extensions, not us. The
 *     browser will only let us *use* the key to sign data.
 *
 *  2. The keypair is persisted in IndexedDB as the CryptoKey objects
 *     themselves. IndexedDB stores CryptoKeys natively and preserves
 *     their `extractable` flag, so the private key remains unreadable
 *     for the lifetime of the storage entry.
 *
 *  3. The "device id" is a fingerprint = sha256(SPKI(publicKey)). It is
 *     derived from the public key, so it is not a secret and is safe to
 *     send to the server (and to keep around in memory). An attacker who
 *     learns the fingerprint cannot impersonate the device because they
 *     don't have the matching private key.
 *
 *  4. To prove "I am still this device", the client signs a fresh,
 *     server-issued nonce. Because the private key is non-extractable,
 *     this proof can only be produced on the original device.
 *
 * Threat model addressed
 * ----------------------
 *  • XSS / page compromise — attacker cannot exfiltrate the private key.
 *    The worst they can do is sign one nonce while their script runs;
 *    they cannot produce future signatures from another device.
 *  • localStorage / cookie theft — there is no token to steal anymore.
 *  • Stolen session cookie reused on another browser — that browser
 *    has a different IndexedDB and therefore a different (or absent)
 *    keypair, so it cannot sign the trust nonce.
 *  • Replay — every nonce is single-use and short-lived (server-side).
 */

const DB_NAME = "tfn.device.v1";
const DB_VERSION = 1;
const STORE = "keys";
const KEY_ID = "device-keypair";

// ============================================================
// IndexedDB helpers
// ============================================================

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

interface StoredKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

async function readStored(): Promise<StoredKeyPair | null> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return null;
  }
  try {
    return await new Promise<StoredKeyPair | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY_ID);
      req.onsuccess = () => {
        const v = req.result as StoredKeyPair | undefined;
        // Sanity-check shape — older or corrupted entries are ignored.
        if (
          v &&
          typeof v === "object" &&
          v.publicKey instanceof CryptoKey &&
          v.privateKey instanceof CryptoKey
        ) {
          resolve(v);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function writeStored(pair: StoredKeyPair): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(pair, KEY_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function clearStored(): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return;
  }
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // best-effort
    });
  } finally {
    db.close();
  }
}

// ============================================================
// Key generation + access
// ============================================================

async function generate(): Promise<StoredKeyPair> {
  // ECDSA P-256 with non-extractable private key.
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    /* extractable */ false,
    ["sign", "verify"],
  );
  // generateKey returns CryptoKeyPair; private inherits extractable=false,
  // public is extractable so we can export the SPKI to the server.
  // We re-import the public key as extractable to be explicit/safe.
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  const publicKey = await crypto.subtle.importKey(
    "spki",
    spki,
    { name: "ECDSA", namedCurve: "P-256" },
    /* extractable */ true,
    ["verify"],
  );
  return { publicKey, privateKey: pair.privateKey };
}

let memoCache: StoredKeyPair | null = null;

async function getOrCreatePair(): Promise<StoredKeyPair> {
  if (memoCache) return memoCache;
  const existing = await readStored();
  if (existing) {
    memoCache = existing;
    return existing;
  }
  const fresh = await generate();
  await writeStored(fresh);
  memoCache = fresh;
  return fresh;
}

// ============================================================
// Encoding helpers
// ============================================================

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ============================================================
// Public API
// ============================================================

/** True if this browser can support the cryptographic device binding scheme. */
export function isDeviceCryptoSupported(): boolean {
  return (
    typeof crypto !== "undefined" &&
    !!crypto.subtle &&
    typeof indexedDB !== "undefined"
  );
}

/** Returns the SPKI of the device public key, base64-encoded. */
export async function getDevicePublicKeySpkiBase64(): Promise<string> {
  const { publicKey } = await getOrCreatePair();
  const spki = await crypto.subtle.exportKey("spki", publicKey);
  return bytesToBase64(new Uint8Array(spki));
}

/**
 * Returns the device fingerprint — sha256 of the SPKI public key, hex.
 * This is the public, non-secret identifier the server uses to look up
 * the trust row. It is safe to log and store anywhere.
 */
export async function getDeviceFingerprint(): Promise<string> {
  const { publicKey } = await getOrCreatePair();
  const spki = await crypto.subtle.exportKey("spki", publicKey);
  const hash = await crypto.subtle.digest("SHA-256", spki);
  return bytesToHex(new Uint8Array(hash));
}

/**
 * Signs the given server-issued nonce with the device private key.
 * Returns a base64-encoded raw ECDSA signature (r||s, IEEE-P1363 format —
 * what WebCrypto uses natively).
 *
 * The nonce is hashed with sha256 first so that a malicious server cannot
 * trick the client into signing a presented payload that happens to be
 * a meaningful message in another protocol.
 */
export async function signDeviceNonce(nonce: string): Promise<string> {
  if (typeof nonce !== "string" || nonce.length === 0 || nonce.length > 256) {
    throw new Error("Invalid nonce");
  }
  const { privateKey } = await getOrCreatePair();
  const data = new TextEncoder().encode(`tfn-device-proof-v1:${nonce}`);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    data,
  );
  return bytesToBase64(new Uint8Array(sig));
}

/**
 * Wipes the device keypair. Call when the user signs out from "all devices",
 * deletes their account, or explicitly says "forget this device". After this
 * call the next visit will generate a brand-new keypair and require fresh
 * MFA verification.
 */
export async function forgetDevice(): Promise<void> {
  memoCache = null;
  await clearStored();
}

// re-export so callers don't need a separate base64 helper
export { base64ToBytes };
