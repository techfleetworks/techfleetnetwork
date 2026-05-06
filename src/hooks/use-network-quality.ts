import { useEffect, useState } from "react";

/**
 * Detects slow networks / Save-Data preference so we can skip non-critical
 * widgets (Fleety, install prompt, large hero images) for users on 2G/3G or
 * those who explicitly opt into data savings.
 *
 * Falls back to `false` (treat as fast) on browsers without the API
 * (Safari, older Firefox) so we never accidentally degrade the majority.
 */
type NetworkConnection = {
  saveData?: boolean;
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

function read(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as Navigator & { connection?: NetworkConnection }).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  return conn.effectiveType === "slow-2g" || conn.effectiveType === "2g";
}

export function useNetworkQuality(): { isSlow: boolean } {
  const [isSlow, setIsSlow] = useState<boolean>(() => read());

  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: NetworkConnection }).connection;
    if (!conn?.addEventListener) return;
    const handler = () => setIsSlow(read());
    conn.addEventListener("change", handler);
    return () => conn.removeEventListener?.("change", handler);
  }, []);

  return { isSlow };
}
