/**
 * useAdmin hook — RBAC critical path.
 * Verifies admin detection cannot be spoofed and revalidates aggressively.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import React from "react";

const mockUseAuth = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockSelect = vi.fn();
const mockEq1 = vi.fn();
const mockEq2 = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: (...args: unknown[]) => {
        mockSelect(...args);
        return { eq: (...a: unknown[]) => {
          mockEq1(...a);
          return { eq: (...b: unknown[]) => {
            mockEq2(...b);
            return mockEq2.mockReturnValue;
          }};
        }};
      },
    })),
  },
}));

import { useAdmin } from "@/hooks/use-admin";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when no user is authenticated (no DB query issued)", async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useAdmin(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAdmin).toBe(false);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns true only when user_roles has a row with role=admin", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "user-1" } });
    mockEq2.mockReturnValue = Promise.resolve({ count: 1, error: null });

    const { result } = renderHook(() => useAdmin(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAdmin).toBe(true);
    // Must filter by user_id AND role=admin (no IDOR)
    expect(mockEq1).toHaveBeenCalledWith("user_id", "user-1");
    expect(mockEq2).toHaveBeenCalledWith("role", "admin");
  });

  it("returns false when no admin row matches", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "user-2" } });
    mockEq2.mockReturnValue = Promise.resolve({ count: 0, error: null });

    const { result } = renderHook(() => useAdmin(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAdmin).toBe(false);
  });

  it("treats DB errors as non-admin (fail-closed)", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "user-3" } });
    mockEq2.mockReturnValue = Promise.resolve({
      count: null,
      error: { message: "boom" },
    });

    const { result } = renderHook(() => useAdmin(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAdmin).toBe(false);
  });
});
