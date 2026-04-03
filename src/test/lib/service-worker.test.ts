import { describe, expect, it } from "vitest";
import {
  getServiceWorkerRecoveryCacheNames,
  getServiceWorkerRetryBackoffMs,
  shouldRecoverFromServiceWorkerError,
} from "@/lib/service-worker";

describe("shouldRecoverFromServiceWorkerError", () => {
  it("flags fetch failures for recovery", () => {
    expect(
      shouldRecoverFromServiceWorkerError(
        new Error(
          "Failed to update a ServiceWorker for scope ('https://techfleetnetwork.lovable.app/') with script ('https://techfleetnetwork.lovable.app/sw.js'): An unknown error occurred when fetching the script.",
        ),
      ),
    ).toBe(true);
  });

  it("ignores unrelated runtime errors", () => {
    expect(shouldRecoverFromServiceWorkerError(new Error("Network request failed"))).toBe(false);
  });
});

describe("getServiceWorkerRecoveryCacheNames", () => {
  it("keeps only workbox and service-worker owned caches", () => {
    expect(
      getServiceWorkerRecoveryCacheNames([
        "workbox-precache-v2-https://techfleetnetwork.lovable.app/",
        "google-fonts-cache",
        "user-avatar-cache",
      ]),
    ).toEqual([
      "workbox-precache-v2-https://techfleetnetwork.lovable.app/",
      "google-fonts-cache",
    ]);
  });
});

describe("getServiceWorkerRetryBackoffMs", () => {
  it("backs off exponentially and caps at five minutes", () => {
    expect(getServiceWorkerRetryBackoffMs(1)).toBe(30_000);
    expect(getServiceWorkerRetryBackoffMs(2)).toBe(60_000);
    expect(getServiceWorkerRetryBackoffMs(5)).toBe(300_000);
  });
});
