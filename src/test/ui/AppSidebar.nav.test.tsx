import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, within, cleanup } from "@testing-library/react";
import { renderWithRouter } from "./test-utils";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

/**
 * Navigation coverage (ADR-0067): the admin "All Classes" and teacher "My Classes" entries are merged
 * into ONE "Class Admin" link under Teaching, shown to teachers AND admins, pointing at
 * /class-admin/classes. Members never see it. The old labels/paths must be gone. Behavioral
 * (Gherkin-style) scenarios wired into Vitest so a regression fails CI.
 */

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "t@example.com" } }),
}));

const adminState = { isAdmin: false };
const teacherState = { isTeacher: false };
vi.mock("@/hooks/use-admin", () => ({ useAdmin: () => adminState }));
vi.mock("@/hooks/use-teacher", () => ({ useTeacher: () => teacherState }));

// Avoid a real PostgREST call for the pending-count badge.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: 0, error: null }) },
}));

function renderSidebar() {
  return renderWithRouter(
    <SidebarProvider>
      <AppSidebar />
    </SidebarProvider>
  );
}

describe("AppSidebar — Class Admin navigation", () => {
  beforeEach(() => {
    adminState.isAdmin = false;
    teacherState.isTeacher = false;
  });
  afterEach(() => cleanup());

  it("never renders the removed admin Curriculum link (any role)", () => {
    adminState.isAdmin = true;
    teacherState.isTeacher = true;
    renderSidebar();
    expect(screen.queryByText("Curriculum")).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/admin/curriculum"]')).toBeNull();
  });

  it("shows a single 'Class Admin' link under Teaching for admins, pointing at /class-admin/classes", () => {
    adminState.isAdmin = true;
    renderSidebar();
    const link = screen.getByRole("link", { name: /class admin/i });
    expect(link).toHaveAttribute("href", "/class-admin/classes");
    const teaching = screen.getByText("Teaching").closest("div[data-sidebar='group']")!;
    expect(within(teaching as HTMLElement).getByText("Class Admin")).toBeInTheDocument();
  });

  it("shows 'Class Admin' to a non-admin teacher too, at the same route", () => {
    teacherState.isTeacher = true;
    renderSidebar();
    expect(screen.getByRole("link", { name: /class admin/i })).toHaveAttribute(
      "href",
      "/class-admin/classes"
    );
  });

  it("hides Class Admin (and the whole Teaching group) from members", () => {
    // neither teacher nor admin
    renderSidebar();
    expect(screen.queryByText("Class Admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Teaching")).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/class-admin/classes"]')).toBeNull();
  });

  it("no longer renders the old 'My Classes' / 'All Classes' entries or the old routes", () => {
    adminState.isAdmin = true;
    teacherState.isTeacher = true;
    renderSidebar();
    expect(screen.queryByText("My Classes")).not.toBeInTheDocument();
    expect(screen.queryByText("All Classes")).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/teach/classes"]')).toBeNull();
    expect(document.querySelector('a[href="/admin/classes"]')).toBeNull();
  });
});
