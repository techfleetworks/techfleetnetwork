import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@/lib/react-query";
import CohortFormPage from "@/pages/CohortFormPage";

/**
 * Regression: a restored cohort server-draft must populate the create form's
 * fields, not just show the "was restored" banner over an empty form.
 */

const DRAFT_PAYLOAD = {
  label: "Restored Cohort",
  start_date: "2026-03-01",
  end_date: "2026-05-01",
  registration_url: "https://example.com/register",
  meeting_url: "",
  timezone: "America/New_York",
  capacity: 25,
  schedule: "",
};

vi.mock("@/lib/auth/session-port", () => ({
  getUserSafe: () => Promise.resolve({ id: "u1" }),
  getSessionSafe: () => Promise.resolve({ access_token: "t" }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const draftSelectChain = {
    eq() {
      return this;
    },
    maybeSingle() {
      return Promise.resolve({
        data: {
          payload: DRAFT_PAYLOAD,
          schema_version: 1,
          updated_at: new Date(Date.now() - 60_000).toISOString(),
          expires_at: null,
        },
        error: null,
      });
    },
  };
  return {
    supabase: {
      from: () => ({
        select: () => draftSelectChain,
        upsert: () => Promise.resolve({ error: null }),
        delete: () => ({
          eq() {
            return this;
          },
        }),
      }),
    },
  };
});

vi.mock("@/hooks/use-cohorts", () => ({
  useCohortById: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("@/components/RichTextEditor", () => ({
  RichTextEditor: ({ content }: { content?: string }) => <div data-testid="rte">{content}</div>,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderCreate() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/teach/classes/cls1/cohorts/new"]}>
        <Routes>
          <Route path="/teach/classes/:id/cohorts/new" element={<CohortFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CohortFormPage — restored draft populates the form", () => {
  it("shows the restored banner AND fills the fields from the draft", async () => {
    renderCreate();

    expect(await screen.findByText(/was restored/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByLabelText("Label")).toHaveValue("Restored Cohort"), {
      timeout: 4000,
    });
    expect(screen.getByLabelText("Registration URL")).toHaveValue("https://example.com/register");
    expect(screen.getByLabelText(/Capacity/i)).toHaveValue(25);
  });
});
