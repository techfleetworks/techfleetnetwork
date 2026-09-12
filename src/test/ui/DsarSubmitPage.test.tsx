// bdd-gate coverage: src/pages/DsarSubmitPage.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// DsarSubmitPage submits a privacy request through invokeEdge("dsar-submit") (ADR-0028 —
// migrated off raw supabase.functions.invoke). These scenarios guard the converted edge call:
// the happy path forwards the request and confirms; a thrown EdgeInvokeError surfaces as a
// toast, never an unhandled rejection.

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

const invokeEdgeMock = vi.fn();
vi.mock("@/lib/edge/invokeEdge", () => ({
  invokeEdge: (...args: unknown[]) => invokeEdgeMock(...args),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) },
}));

vi.mock("@/components/SEO", () => ({ SEO: () => null }));

import DsarSubmitPage from "@/pages/DsarSubmitPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/privacy/dsar"]}>
      <DsarSubmitPage />
    </MemoryRouter>
  );
}

describe("DsarSubmitPage submit", () => {
  beforeEach(() => {
    invokeEdgeMock.mockReset();
    navigateMock.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("submits the request through invokeEdge and confirms on success", async () => {
    invokeEdgeMock.mockResolvedValue({ id: "req-12345678" });
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: /submit request/i }));

    await waitFor(() =>
      expect(invokeEdgeMock).toHaveBeenCalledWith("dsar-submit", {
        body: { type: "access", payload: { details: "" } },
      })
    );
    expect(toastSuccess).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/privacy");
  });

  it("surfaces a thrown edge failure as an error toast without navigating", async () => {
    invokeEdgeMock.mockRejectedValue(new Error("edge down"));
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: /submit request/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("edge down"));
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
