/**
 * Tests for split-screen login page and remember me functionality.
 * Covers: layout rendering, remember me checkbox, error display, loading state.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Polyfill PointerEvent for jsdom (required by @base-ui/react checkbox)
beforeAll(() => {
  if (typeof globalThis.PointerEvent === "undefined") {
    // @ts-expect-error -- minimal polyfill for jsdom
    globalThis.PointerEvent = class PointerEvent extends MouseEvent {
      readonly pointerId: number;
      readonly pointerType: string;
      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params);
        this.pointerId = params.pointerId ?? 0;
        this.pointerType = params.pointerType ?? "";
      }
    };
  }
});

import {
  createMockSession,
  mockAuthClient,
  resetAuthMocks,
} from "@/test-utils/mock-auth-client";

const { pushMock, signInEmailMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  signInEmailMock: vi.fn(async () => ({ data: {}, error: null })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/sign-in",
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    ...mockAuthClient,
    signIn: { email: signInEmailMock },
  },
}));

import SignInPage from "@/app/(auth)/sign-in/page";

describe("sign-in page — split-screen layout and remember me", () => {
  beforeEach(() => {
    pushMock.mockReset();
    signInEmailMock.mockReset();
    signInEmailMock.mockResolvedValue({ data: {}, error: null });
    resetAuthMocks();
  });

  it("renders split-screen layout with branding text", () => {
    render(<SignInPage />);

    expect(screen.getByText("Sign in to SMS Platform")).toBeInTheDocument();
    expect(
      screen.getByText("Surveillance Management System"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Embed live CCTV streams on your website with a single API call.",
      ),
    ).toBeInTheDocument();
  });

  it("renders remember me checkbox", () => {
    render(<SignInPage />);

    expect(screen.getByText("Remember me")).toBeInTheDocument();
    // Checkbox should exist with role
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeInTheDocument();
  });

  it("passes rememberMe: true when checkbox is checked (default)", async () => {
    mockAuthClient.getSession.mockResolvedValue(
      createMockSession({ userRole: "user", activeOrgId: "org-test-1" }),
    );

    render(<SignInPage />);

    const email = await screen.findByLabelText(/email/i);
    const password = await screen.findByLabelText(/password/i);
    await userEvent.type(email, "user@test.com");
    await userEvent.type(password, "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(signInEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "user@test.com",
          password: "password123",
          rememberMe: true,
        }),
      );
    });
  });

  it("passes rememberMe: false when checkbox is unchecked", async () => {
    mockAuthClient.getSession.mockResolvedValue(
      createMockSession({ userRole: "user", activeOrgId: "org-test-1" }),
    );

    render(<SignInPage />);

    // Uncheck the remember me checkbox
    const checkbox = screen.getByRole("checkbox");
    await userEvent.click(checkbox);

    const email = await screen.findByLabelText(/email/i);
    const password = await screen.findByLabelText(/password/i);
    await userEvent.type(email, "user@test.com");
    await userEvent.type(password, "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(signInEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "user@test.com",
          password: "password123",
          rememberMe: false,
        }),
      );
    });
  });

  it("shows error message on failed login", async () => {
    signInEmailMock.mockRejectedValueOnce(new Error("Network error"));

    render(<SignInPage />);

    const email = await screen.findByLabelText(/email/i);
    const password = await screen.findByLabelText(/password/i);
    await userEvent.type(email, "user@test.com");
    await userEvent.type(password, "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Invalid email or password. Please try again."),
      ).toBeInTheDocument();
    });
  });

  it("disables inputs during loading", async () => {
    // signIn.email returns a promise that never resolves to keep loading state
    let resolveSignIn: (v: unknown) => void;
    signInEmailMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve;
        }),
    );

    render(<SignInPage />);

    const email = await screen.findByLabelText(/email/i);
    const password = await screen.findByLabelText(/password/i);
    await userEvent.type(email, "user@test.com");
    await userEvent.type(password, "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(email).toBeDisabled();
      expect(password).toBeDisabled();
    });

    // Cleanup: resolve the pending promise
    resolveSignIn!({ data: {}, error: null });
  });
});
