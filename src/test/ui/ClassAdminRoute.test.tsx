import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import { renderWithRouter } from "./test-utils";

// bdd-gate coverage: src/components/ClassAdminRoute.tsx

/**
 * ClassAdminRoute (ADR-0067) — role gate + role-aware 2FA:
 *  - member  → denied (children never render)
 *  - teacher → 2FA optional (allowed if not enrolled; hard-blocked if enrolled but below AAL2)
 *  - admin   → 2FA mandatory (enrolled+AAL2 in; enrolled+AAL1 blocked; not enrolled → grace/setup)
 * Composed from existing hooks; here they're stubbed to drive each cell of the truth table.
 */

const authState = {
  user: { id: "u1" } as { id: string } | null,
  loading: false,
  profileLoaded: true,
};
const adminState = { isAdmin: false, loading: false };
const teacherState = { isTeacher: false, loading: false };
const gateState = {
  data: undefined as
    { hasVerifiedTotp: boolean; currentAal: string | null; needsChallenge: boolean } | undefined,
  isLoading: false,
};
const graceState = { active: null as boolean | null, deadline: null as string | null };

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("@/hooks/use-admin", () => ({ useAdmin: () => adminState }));
vi.mock("@/hooks/use-teacher", () => ({ useTeacher: () => teacherState }));
vi.mock("@/hooks/use-mfa-gate", () => ({
  useMfaGate: () => ({ data: gateState.data, isLoading: gateState.isLoading }),
}));
vi.mock("@/lib/db/rpc-with-timeout", () => ({
  rpcWithTimeout: vi.fn(async (name: string) => {
    if (name === "admin_2fa_grace_active") return { data: graceState.active, error: null };
    if (name === "admin_2fa_grace_deadline") return { data: graceState.deadline, error: null };
    return { data: null, error: null };
  }),
}));
vi.mock("@/lib/auth/session-port", () => ({ signOutSafe: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/components/MfaChallengeDialog", () => ({
  MfaChallengeDialog: ({ open }: { open: boolean }) => (open ? <div>CHALLENGE</div> : null),
}));

// Import AFTER mocks are registered.
import { ClassAdminRoute } from "@/components/ClassAdminRoute";

// Render the guard as a real route element. It must live inside <Routes> so that when it renders a
// <Navigate> (member → /access-denied, signed-out → /login) React Router matches the target route and
// UNMOUNTS the guard — exactly as in production (App.tsx). Rendering it bare would leave <Navigate>
// mounted, re-navigating every render with a fresh `state` object, an async loop that leaks until OOM.
function renderGuard() {
  return renderWithRouter(
    <Routes>
      <Route
        path="/"
        element={
          <ClassAdminRoute>
            <div>PROTECTED</div>
          </ClassAdminRoute>
        }
      />
      <Route path="/access-denied" element={<div>ACCESS DENIED</div>} />
      <Route path="/login" element={<div>LOGIN</div>} />
    </Routes>
  );
}

const enrolledAal2 = { hasVerifiedTotp: true, currentAal: "aal2", needsChallenge: false };
const enrolledAal1 = { hasVerifiedTotp: true, currentAal: "aal1", needsChallenge: true };
const notEnrolled = { hasVerifiedTotp: false, currentAal: "aal1", needsChallenge: false };

describe("ClassAdminRoute — access + role-aware 2FA", () => {
  beforeEach(() => {
    authState.user = { id: "u1" };
    authState.loading = false;
    authState.profileLoaded = true;
    adminState.isAdmin = false;
    adminState.loading = false;
    teacherState.isTeacher = false;
    teacherState.loading = false;
    gateState.data = undefined;
    gateState.isLoading = false;
    graceState.active = null;
    graceState.deadline = null;
  });
  afterEach(() => cleanup());

  it("denies a member (neither teacher nor admin): children never render", () => {
    renderGuard();
    expect(screen.queryByText("PROTECTED")).not.toBeInTheDocument();
  });

  it("lets a teacher with no 2FA enrolled straight through (2FA optional)", () => {
    teacherState.isTeacher = true;
    gateState.data = notEnrolled;
    renderGuard();
    expect(screen.getByText("PROTECTED")).toBeInTheDocument();
  });

  it("hard-blocks a teacher who is enrolled but below AAL2, showing the challenge", () => {
    teacherState.isTeacher = true;
    gateState.data = enrolledAal1;
    renderGuard();
    expect(screen.queryByText("PROTECTED")).not.toBeInTheDocument();
    expect(screen.getByText("CHALLENGE")).toBeInTheDocument();
  });

  it("lets an enrolled, AAL2 admin in", () => {
    adminState.isAdmin = true;
    gateState.data = enrolledAal2;
    renderGuard();
    expect(screen.getByText("PROTECTED")).toBeInTheDocument();
  });

  it("hard-blocks an enrolled admin below AAL2, showing the challenge", () => {
    adminState.isAdmin = true;
    gateState.data = enrolledAal1;
    renderGuard();
    expect(screen.queryByText("PROTECTED")).not.toBeInTheDocument();
    expect(screen.getByText("CHALLENGE")).toBeInTheDocument();
  });

  it("admin without 2FA, grace ACTIVE → shows a banner but still renders children", async () => {
    adminState.isAdmin = true;
    gateState.data = notEnrolled;
    graceState.active = true;
    graceState.deadline = "2030-01-01T00:00:00.000Z";
    renderGuard();
    await waitFor(() => expect(screen.getByText("PROTECTED")).toBeInTheDocument());
    expect(screen.getByText(/grace period/i)).toBeInTheDocument();
  });

  it("admin without 2FA, grace EXPIRED → blocks with the setup prompt", async () => {
    adminState.isAdmin = true;
    gateState.data = notEnrolled;
    graceState.active = false;
    renderGuard();
    await waitFor(() => expect(screen.getByText(/Admin 2FA setup required/i)).toBeInTheDocument());
    expect(screen.queryByText("PROTECTED")).not.toBeInTheDocument();
  });
});
