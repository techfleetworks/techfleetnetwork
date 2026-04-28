import { describe, expect, it, vi } from "vitest";
import { handleServiceError, serviceErrorMetadata } from "@/lib/service-result";

const logger = () => ({ warn: vi.fn(), error: vi.fn() });

describe("service-result helpers", () => {
  it("normalizes backend error metadata for structured logs", () => {
    expect(serviceErrorMetadata({ message: "failed", code: "PGRST", details: "bad", hint: "retry" })).toEqual({
      errorCode: "PGRST",
      errorDetails: "bad",
      errorHint: "retry",
    });
  });

  it("logs and returns true for handled non-throwing errors", () => {
    const log = logger();
    const handled = handleServiceError({ message: "failed", code: "42501" }, { logger: log, action: "load", message: "Load failed", level: "warn" });
    expect(handled).toBe(true);
    expect(log.warn).toHaveBeenCalledWith("load", "Load failed", expect.objectContaining({ errorCode: "42501" }), expect.any(Object));
  });

  it("throws a safe user-facing message when configured", () => {
    const log = logger();
    expect(() => handleServiceError({ message: "private database detail" }, { logger: log, action: "save", message: "Save failed", throwMessage: "Failed to save." })).toThrow("Failed to save.");
    expect(log.error).toHaveBeenCalled();
  });
});