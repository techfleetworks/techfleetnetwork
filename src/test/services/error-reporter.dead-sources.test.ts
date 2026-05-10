import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase client BEFORE importing the SUT so reportToAuditLog
// uses our spies.
const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });
const fromMock = vi.fn(() => ({
  select: () => ({
    eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: rpcMock, from: fromMock, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } },
}));

const checkDeployNowMock = vi.fn();
vi.mock("@/lib/deploy-watcher", () => ({
  checkNow: checkDeployNowMock,
}));

vi.mock("@/lib/trace", () => ({ getCurrentTraceId: () => undefined }));

// eslint-disable-next-line import/first
import { reportError } from "@/services/error-reporter.service";

beforeEach(() => {
  rpcMock.mockClear();
  checkDeployNowMock.mockClear();
});

describe("error-reporter — dead-source / stale-bundle suppression", () => {
  it("never writes audit_log for SupportWidget.token sources (closed bypass)", async () => {
    reportError(
      new Error("FunctionsFetchError: Failed to send a request to the Edge Function"),
      "SupportWidget.token",
      { severity: "warn" },
    );
    // Allow any microtasks to resolve
    await new Promise((r) => setTimeout(r, 0));
    expect(rpcMock).not.toHaveBeenCalledWith("write_audit_log", expect.anything());
  });

  it("triggers a deploy-watcher check on FunctionsFetchError so stuck tabs reload", async () => {
    reportError(
      new Error("FunctionsFetchError: Failed to send a request to the Edge Function"),
      "SupportWidget.token",
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(checkDeployNowMock).toHaveBeenCalled();
  });

  it("still surfaces real errors from live components", async () => {
    reportError(new Error("ReferenceError: foo is not defined"), "DashboardPage.handleX");
    await new Promise((r) => setTimeout(r, 0));
    expect(rpcMock).toHaveBeenCalledWith(
      "write_audit_log",
      expect.objectContaining({ p_event_type: "client_error" }),
    );
  });
});
