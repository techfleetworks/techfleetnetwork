import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConfirmSignupEngine } from "@/features/auth/engine/use-confirm-signup-engine";
import {
  confirmSignupByCode,
  confirmSignupByTokenHash,
} from "@/features/auth/services/confirm-signup.service";

const navigate = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await (orig as () => Promise<Record<string, unknown>>)()),
  useNavigate: () => navigate,
}));

vi.mock("@/features/auth/services/confirm-signup.service", () => ({
  confirmSignupByCode: vi.fn(),
  confirmSignupByTokenHash: vi.fn(),
}));

const mockedByCode = vi.mocked(confirmSignupByCode);
const mockedByTokenHash = vi.mocked(confirmSignupByTokenHash);
const okResult = { data: { session: {}, user: {} }, error: null } as never;
const submitEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

function setUrl(search: string) {
  window.history.replaceState({}, "", `/auth/confirm${search}`);
}

describe("useConfirmSignupEngine — ADR-0064", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUrl("");
  });

  it("is INERT on load — no verifyOtp runs on mount (scanner/prefetch safe)", () => {
    setUrl("?token_hash=hash-1&type=signup");
    renderHook(() => useConfirmSignupEngine());
    expect(mockedByCode).not.toHaveBeenCalled();
    expect(mockedByTokenHash).not.toHaveBeenCalled();
  });

  it("reads token_hash + email from the URL and strips the token_hash from the address bar", () => {
    setUrl("?token_hash=hash-1&type=signup&email=member%40example.com");
    const { result } = renderHook(() => useConfirmSignupEngine());
    expect(result.current.hasTokenHash).toBe(true);
    expect(result.current.email).toBe("member@example.com");
    expect(result.current.emailLocked).toBe(true);
    expect(window.location.search).not.toContain("token_hash");
  });

  it("code path: valid code verifies and routes to the dashboard", async () => {
    mockedByCode.mockResolvedValue(okResult);
    const { result } = renderHook(() => useConfirmSignupEngine());
    act(() => {
      result.current.setEmail("member@example.com");
      result.current.setCode("123456");
    });
    await act(async () => {
      await result.current.handleSubmitCode(submitEvent);
    });
    expect(mockedByCode).toHaveBeenCalledWith("member@example.com", "123456");
    expect(navigate).toHaveBeenCalledWith("/dashboard?from=confirm-email", { replace: true });
    expect(result.current.success).toBe(true);
  });

  it("button path: token_hash confirm verifies and routes to the dashboard", async () => {
    setUrl("?token_hash=hash-xyz&type=signup");
    mockedByTokenHash.mockResolvedValue(okResult);
    const { result } = renderHook(() => useConfirmSignupEngine());
    await act(async () => {
      await result.current.handleConfirmByButton();
    });
    expect(mockedByTokenHash).toHaveBeenCalledWith("hash-xyz");
    expect(navigate).toHaveBeenCalledWith("/dashboard?from=confirm-email", { replace: true });
  });

  it("an expired code shows a friendly message, enables resend, and does NOT navigate", async () => {
    mockedByCode.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Token has expired or is invalid", status: 401 },
    } as never);
    const { result } = renderHook(() => useConfirmSignupEngine());
    act(() => {
      result.current.setEmail("member@example.com");
      result.current.setCode("000000");
    });
    await act(async () => {
      await result.current.handleSubmitCode(submitEvent);
    });
    expect(result.current.error).toMatch(/expired|doesn't match/i);
    expect(result.current.canResend).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("an incomplete code is rejected client-side without calling GoTrue", async () => {
    const { result } = renderHook(() => useConfirmSignupEngine());
    act(() => {
      result.current.setEmail("member@example.com");
      result.current.setCode("12");
    });
    await act(async () => {
      await result.current.handleSubmitCode(submitEvent);
    });
    expect(mockedByCode).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/6-digit code/i);
  });

  it("a missing/invalid email is rejected before calling GoTrue", async () => {
    const { result } = renderHook(() => useConfirmSignupEngine());
    act(() => {
      result.current.setEmail("not-an-email");
      result.current.setCode("123456");
    });
    await act(async () => {
      await result.current.handleSubmitCode(submitEvent);
    });
    expect(mockedByCode).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/email/i);
  });
});
