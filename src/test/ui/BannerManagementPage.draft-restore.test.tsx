import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@/lib/react-query";
import BannerManagementPage from "@/pages/BannerManagementPage";
// Module under test: src/pages/BannerManagementPage.tsx

/**
 * Regression: opening "New Banner" with an existing server-draft must populate
 * the dialog fields, not just show the "was restored" banner over empty inputs.
 */

const DRAFT_PAYLOAD = {
  title: "Restored Banner Title",
  body_html: "",
  status: "draft",
  reopen_after_dismiss: false,
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

vi.mock("@/services/banner.service", () => ({
  fetchAllBanners: () => Promise.resolve([]),
  createBanner: vi.fn(),
  updateBanner: vi.fn(),
  deleteBanner: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, session: {}, loading: false, profileLoaded: true }),
}));

vi.mock("@/contexts/PageHeaderContext", () => ({
  usePageHeader: () => ({ setHeader: vi.fn() }),
}));

vi.mock("@/components/RichTextEditor", () => ({
  RichTextEditor: ({ content }: { content?: string }) => <div data-testid="rte">{content}</div>,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BannerManagementPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("BannerManagementPage — restored draft populates the create dialog", () => {
  it("shows the restored banner AND fills the Title when New Banner is opened", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "New Banner" }));

    expect(await screen.findByText(/was restored/i)).toBeInTheDocument();
    await waitFor(
      () => expect(screen.getByLabelText("Title")).toHaveValue("Restored Banner Title"),
      { timeout: 4000 }
    );
  });
});
