// bdd-gate coverage: src/services/announcement.service.ts
// bdd-gate coverage: src/pages/ProfileSetupPage.tsx — its signup marketing opt-in calls the
// set_my_marketing_subscription RPC, which is exercised by supabase/tests/email_octopus_sync_test.sql.
import { describe, it, expect, vi, beforeEach } from "vitest";

// PR 7: sendNotifications must carry the admin's not-marketing attestation to the edge function,
// which refuses to send without it.
const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    from: vi.fn(),
  },
}));
vi.mock("@/lib/cached-session", () => ({
  getCachedSession: () => Promise.resolve({ access_token: "tok" }),
}));

import { AnnouncementService } from "@/services/announcement.service";

describe("AnnouncementService.sendNotifications marketing attestation", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ error: null });
  });

  it("passes marketing_attested: true when the admin attested", async () => {
    await AnnouncementService.sendNotifications("ann-1", true);
    // Routed through invokeEdge now (ADR-0028), which adds an x-trace-id header — assert the
    // meaningful contract (Authorization + attestation body), tolerant of that added header.
    expect(invokeMock).toHaveBeenCalledWith(
      "send-announcement-email",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        body: { announcement_id: "ann-1", marketing_attested: true },
      })
    );
  });

  it("forwards a false attestation verbatim (the edge function rejects it)", async () => {
    await AnnouncementService.sendNotifications("ann-2", false);
    expect(invokeMock).toHaveBeenCalledWith(
      "send-announcement-email",
      expect.objectContaining({
        body: { announcement_id: "ann-2", marketing_attested: false },
      })
    );
  });

  it("swallows a warn-level edge failure without rejecting (handleServiceError owns it)", async () => {
    // invokeEdge throws on failure; sendNotifications logs at warn with no throwMessage, so the
    // caller must not see a rejection. Regression guard for the raw-invoke→invokeEdge conversion.
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ error: { message: "boom" } });
    await expect(AnnouncementService.sendNotifications("ann-3", true)).resolves.toBeUndefined();
  });
});
