import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@/lib/react-query";
import ClassFormPage from "@/pages/ClassFormPage";
// Module under test: src/pages/ClassFormPage.tsx

/**
 * Regression: a restored server-draft must actually populate the create form's
 * fields — not just show the "was restored" banner over an empty form.
 *
 * Repro of the reported bug: member creating a New Class got logged out, came
 * back, saw "Your class draft … was restored", but every field was blank and
 * the only option was Discard.
 */

// ---------- Draft fixture returned by the mocked form_drafts select ----------
const DRAFT_PAYLOAD = {
  form: {
    title: "Restored Title",
    summary: "",
    description: "",
    track: "basic_training",
    hero_image_url: "",
    skills: [],
    outcomes: "",
    why_take: "",
    audiences: "",
    prerequisites: [],
    curriculum: "",
    reading_assignments: "",
    class_expectations: "",
  },
  prereqText: "Alpha\nBeta",
};

// ---------- Mocks ----------
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
  const upsertChain = () => Promise.resolve({ error: null });
  const deleteChain = {
    eq() {
      return this;
    },
    then: undefined,
  } as any;
  return {
    supabase: {
      from: () => ({
        select: () => draftSelectChain,
        upsert: upsertChain,
        delete: () => ({
          eq() {
            return this;
          },
        }),
      }),
    },
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, session: {}, loading: false, profileLoaded: true }),
}));

vi.mock("@/hooks/use-classes", () => ({
  useClassById: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("@/hooks/use-reference", () => ({
  useReferenceList: () => ({ data: [], isLoading: false, isError: false }),
}));

// Heavy editor / uploader stand-ins so the form renders deterministically.
vi.mock("@/components/RichTextEditor", () => ({
  RichTextEditor: ({ content }: { content?: string }) => <div data-testid="rte">{content}</div>,
}));
vi.mock("@/components/ClassImageUpload", () => ({
  ClassImageUpload: () => <div data-testid="image-upload" />,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderCreate() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/teach/classes/new"]}>
        <Routes>
          <Route path="/teach/classes/new" element={<ClassFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ClassFormPage — restored draft populates the form", () => {
  it("shows the restored banner AND fills the fields from the draft", async () => {
    renderCreate();

    // The banner appears once the draft hydrates.
    expect(await screen.findByText(/was restored/i)).toBeInTheDocument();

    // The reported bug: banner shows but the Title is empty. Assert it is filled.
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Restored Title"), {
      timeout: 4000,
    });

    // Prerequisites textarea should carry the restored buffer.
    expect(screen.getByLabelText(/Prerequisites/i)).toHaveValue("Alpha\nBeta");
  });

  it("discarding the draft clears the fields and removes the banner", async () => {
    renderCreate();

    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Restored Title"), {
      timeout: 4000,
    });

    // Open the discard confirmation (banner trigger), then confirm.
    fireEvent.click(screen.getByRole("button", { name: "Discard class draft and start over" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard class draft" }));

    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue(""));
    expect(screen.queryByText(/was restored/i)).not.toBeInTheDocument();
  });
});
