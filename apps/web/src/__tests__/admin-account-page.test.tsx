/**
 * Phase 16 Plan 16-03 — /admin/account page tests.
 *
 * Asserts:
 *   - Super admin sees Profile + Security only (NO Plan & Usage per D-02).
 *   - No network fetch to `/plan-usage` happens from this page.
 *   - Unauthenticated -> `router.replace('/sign-in')`.
 *   - Non-admin (`role !== 'admin'`) -> `router.replace('/app/dashboard')`.
 *
 * Threat citations: T-16-04 (auth redirect), T-16-17 (non-admin URL guess),
 * T-16-18 (accidental tenant-plan-usage disclosure to platform operator).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AdminAccountPage from "@/app/admin/account/page";

// Mock next/navigation: capture router.replace calls.
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), prefetch: vi.fn() }),
}));

// Mock auth-client. updateUser + changePassword are invoked by the reused
// Profile + Security sections during render; keep them as resolved no-ops so
// the reused components render without crashing.
const getSessionMock = vi.fn();
const updateUserMock = vi.fn(async (_arg?: unknown) => ({
  data: {},
  error: null,
}));
const changePasswordMock = vi.fn(async (_arg?: unknown) => ({
  data: {},
  error: null,
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    getSession: () => getSessionMock(),
    updateUser: (...args: unknown[]) => updateUserMock(...args),
    changePassword: (...args: unknown[]) => changePasswordMock(...args),
  },
}));

// Mock fetch so we can assert no /plan-usage call is issued from /admin/account.
const fetchMock = vi.fn();

beforeEach(() => {
  replaceMock.mockReset();
  getSessionMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function adminSession() {
  return {
    data: {
      user: {
        id: "u-admin",
        name: "Admin User",
        email: "a@x.co",
        image: null,
        role: "admin",
      },
      session: { id: "s-1" },
    },
    error: null,
  };
}

describe("/admin/account page", () => {
  it("renders 'Account settings' heading for admin session", async () => {
    getSessionMock.mockResolvedValue(adminSession());
    render(<AdminAccountPage />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "Account settings" }),
      ).toBeInTheDocument(),
    );
  });

  it("renders Profile section title", async () => {
    getSessionMock.mockResolvedValue(adminSession());
    render(<AdminAccountPage />);
    await waitFor(() =>
      expect(screen.getByText("Profile")).toBeInTheDocument(),
    );
  });

  it("renders Security section title", async () => {
    getSessionMock.mockResolvedValue(adminSession());
    render(<AdminAccountPage />);
    await waitFor(() =>
      expect(screen.getByText("Security")).toBeInTheDocument(),
    );
  });

  it("does NOT render Plan & Usage section (D-02)", async () => {
    getSessionMock.mockResolvedValue(adminSession());
    render(<AdminAccountPage />);
    await waitFor(() =>
      expect(screen.getByText("Profile")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Plan\s*&\s*Usage/)).toBeNull();
    // Sentinels from AccountPlanSection — should never appear on /admin/account.
    expect(screen.queryByText("Cameras")).toBeNull();
    expect(screen.queryByText("Concurrent viewers")).toBeNull();
  });

  it("does NOT fetch /api/organizations/.../plan-usage (T-16-18)", async () => {
    getSessionMock.mockResolvedValue(adminSession());
    render(<AdminAccountPage />);
    await waitFor(() =>
      expect(screen.getByText("Profile")).toBeInTheDocument(),
    );
    const planUsageCalls = fetchMock.mock.calls.filter(([url]) => {
      if (typeof url === "string") return url.includes("/plan-usage");
      if (url && typeof url === "object" && "url" in url) {
        return String((url as { url: string }).url).includes("/plan-usage");
      }
      return false;
    });
    expect(planUsageCalls).toHaveLength(0);
  });

  it("redirects to /sign-in when session has no user (T-16-04)", async () => {
    getSessionMock.mockResolvedValue({ data: null, error: null });
    render(<AdminAccountPage />);
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/sign-in"),
    );
  });

  it("redirects to /app/dashboard when user.role is not admin (T-16-17)", async () => {
    getSessionMock.mockResolvedValue({
      data: {
        user: {
          id: "u-tenant",
          name: "Tenant",
          email: "t@x.co",
          image: null,
          role: "user",
        },
        session: { id: "s-1" },
      },
      error: null,
    });
    render(<AdminAccountPage />);
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/app/dashboard"),
    );
  });
});
