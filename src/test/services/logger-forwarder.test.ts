// bdd-gate coverage: src/services/logger.service.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createLogger, setLoggerErrorForwarder } from "@/services/logger.service";

describe("logger error forwarder (ADR-0021)", () => {
  afterEach(() => {
    setLoggerErrorForwarder(null);
    vi.restoreAllMocks();
  });

  it("forwards error-level logs with a redacted message + source", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fwd = vi.fn();
    setLoggerErrorForwarder(fwd);
    createLogger("FwdSvcA").error("save", "failed for alice@example.com");
    expect(fwd).toHaveBeenCalledTimes(1);
    const payload = fwd.mock.calls[0][0] as { service: string; action: string; message: string };
    expect(payload.service).toBe("FwdSvcA");
    expect(payload.action).toBe("save");
    expect(payload.message).toContain("[redacted-email]");
    expect(payload.message).not.toContain("alice@example.com");
  });

  it("does NOT forward non-error levels", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fwd = vi.fn();
    setLoggerErrorForwarder(fwd);
    const log = createLogger("FwdSvcB");
    log.info("x", "hello");
    log.warn("y", "watch out");
    expect(fwd).not.toHaveBeenCalled();
  });

  it("does NOT forward an error the caller already reported (suppressForward — ADR-0021 ramp)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fwd = vi.fn();
    setLoggerErrorForwarder(fwd);
    // handleServiceError logs with { suppressForward: true } because it calls
    // reportError itself — the bridge must not report it a second time once ramped.
    createLogger("FwdSvcSup").error("save", "already reported", {}, new Error("x"), {
      suppressForward: true,
    });
    expect(fwd).not.toHaveBeenCalled();
  });

  it("still forwards a normal error-level log (suppressForward defaults off)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fwd = vi.fn();
    setLoggerErrorForwarder(fwd);
    createLogger("FwdSvcDef").error("save", "boom", {}, new Error("x"));
    expect(fwd).toHaveBeenCalledTimes(1);
  });

  it("never throws if the forwarder throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setLoggerErrorForwarder(() => {
      throw new Error("boom");
    });
    expect(() => createLogger("FwdSvcC").error("z", "kaboom")).not.toThrow();
  });

  it("can be uninstalled", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fwd = vi.fn();
    setLoggerErrorForwarder(fwd);
    setLoggerErrorForwarder(null);
    createLogger("FwdSvcD").error("z", "msg");
    expect(fwd).not.toHaveBeenCalled();
  });
});
