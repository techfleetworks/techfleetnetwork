import { describe, expect, it, vi, afterEach } from "vitest";
import { handleServiceError, serviceErrorMetadata } from "@/lib/service-result";
import { createLogger, setLoggerErrorForwarder } from "@/services/logger.service";
import { reportError } from "@/services/error-reporter.service";

vi.mock("@/services/error-reporter.service", () => ({ reportError: vi.fn() }));

const logger = () => ({ warn: vi.fn(), error: vi.fn() });

afterEach(() => {
  setLoggerErrorForwarder(null);
  vi.clearAllMocks();
});

describe("service-result helpers", () => {
  it("normalizes backend error metadata for structured logs", () => {
    expect(
      serviceErrorMetadata({ message: "failed", code: "PGRST", details: "bad", hint: "retry" })
    ).toEqual({
      errorCode: "PGRST",
      errorDetails: "bad",
      errorHint: "retry",
    });
  });

  it("logs and returns true for handled non-throwing errors", () => {
    const log = logger();
    const handled = handleServiceError(
      { message: "failed", code: "42501" },
      { logger: log, action: "load", message: "Load failed", level: "warn" }
    );
    expect(handled).toBe(true);
    expect(log.warn).toHaveBeenCalledWith(
      "load",
      "Load failed",
      expect.objectContaining({ errorCode: "42501" }),
      expect.any(Object),
      { suppressForward: true }
    );
  });

  it("throws a safe user-facing message when configured", () => {
    const log = logger();
    expect(() =>
      handleServiceError(
        { message: "private database detail" },
        { logger: log, action: "save", message: "Save failed", throwMessage: "Failed to save." }
      )
    ).toThrow("Failed to save.");
    expect(log.error).toHaveBeenCalled();
  });

  it("does not double-report once the logger bridge is live: its log is suppressForward'd, reportError fires once (ADR-0021 ramp)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const bridge = vi.fn(); // stands in for the logger_error_reporting forwarder
    setLoggerErrorForwarder(bridge);
    const log = createLogger("SvcResultDouble"); // the REAL logger, not the mock
    handleServiceError(
      { message: "db down", code: "PGRST002" },
      { logger: log, action: "load", message: "Load failed" }
    );
    // The bridge must NOT also report it (that would be the second audit row)...
    expect(bridge).not.toHaveBeenCalled();
    // ...and handleServiceError's own reportError is the single report.
    expect(vi.mocked(reportError)).toHaveBeenCalledTimes(1);
  });
});
