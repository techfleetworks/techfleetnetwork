// bdd-gate coverage: src/services/class-emails.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * class-status emails build a deep link to the class. After the Class Admin merge (ADR-0063) that
 * link points at the /class-admin/* namespace: admins land on the Classes list, the owning teacher
 * on their class. This locks that in so a regression can't send stale /admin/classes or
 * /teach/classes links (which only work via redirect).
 */
const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: h.rpc,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: h.maybeSingle }) }),
    }),
    functions: { invoke: h.invoke },
  },
}));

vi.mock("@/lib/auth/session-port", () => ({
  getUserSafe: vi.fn().mockResolvedValue({ id: "actor-1" }),
}));

import { sendClassStatusEmails } from "@/services/class-emails";

function linkFor(role: "teacher" | "admin"): string | undefined {
  const call = h.invoke.mock.calls.find((c) => c?.[1]?.body?.templateData?.recipientRole === role);
  return call?.[1]?.body?.templateData?.linkPath;
}

describe("sendClassStatusEmails — deep links to Class Admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.invoke.mockResolvedValue({ data: null, error: null });
    h.maybeSingle.mockResolvedValue({
      data: { first_name: "Act", last_name: "Or" },
      error: null,
    });
    h.rpc.mockImplementation((name: string) => {
      if (name === "get_class_email_recipients") {
        return Promise.resolve({
          data: [
            {
              owner_user_id: "owner-1",
              owner_email: "teacher@example.com",
              owner_name: "Teacher",
              class_title: "Product Discovery",
            },
          ],
          error: null,
        });
      }
      if (name === "list_admin_email_recipients") {
        return Promise.resolve({
          data: [{ user_id: "admin-1", email: "admin@example.com", full_name: "Admin" }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  it("links the teacher to their class under /class-admin/classes/:id", async () => {
    await sendClassStatusEmails("cls-1", "approved");
    expect(linkFor("teacher")).toBe("/class-admin/classes/cls-1");
  });

  it("links admins to the Class Admin classes list", async () => {
    await sendClassStatusEmails("cls-1", "approved");
    expect(linkFor("admin")).toBe("/class-admin/classes");
  });

  it("never emits a legacy /admin/classes or /teach/classes link", async () => {
    await sendClassStatusEmails("cls-1", "approved");
    const links = h.invoke.mock.calls.map((c) => c?.[1]?.body?.templateData?.linkPath ?? "");
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) {
      expect(l.startsWith("/class-admin/")).toBe(true);
    }
  });
});
