// bdd-gate coverage: src/services/system-health.service.ts
//
// Guards the ADR-0056 removal of the Refactor-KPIs surface from SystemHealthService:
// the two KPI methods are gone, while the email-pipeline methods that back the KEPT
// System Health tabs remain. Fails if a later change re-adds the removed methods or
// drops one of the live ones. The supabase client is mocked so this asserts the module's
// public surface without constructing a client or touching the network.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

import { SystemHealthService } from "@/services/system-health.service";

describe("SystemHealthService surface (ADR-0056)", () => {
  it("SYS-HEALTH-SVC-001: no longer exposes the removed Refactor-KPIs methods", () => {
    expect(SystemHealthService).not.toHaveProperty("getRefactorKpis");
    expect(SystemHealthService).not.toHaveProperty("runRefactorKpisSnapshot");
  });

  it("SYS-HEALTH-SVC-002: still exposes the email-pipeline methods backing the kept tabs", () => {
    expect(typeof SystemHealthService.getEmailPipelineHealth).toBe("function");
    expect(typeof SystemHealthService.getEmailReconcilerStatus).toBe("function");
  });
});
