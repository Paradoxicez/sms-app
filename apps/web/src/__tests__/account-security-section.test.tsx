// Phase 16-02 Task 4 — AccountSecuritySection.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

type ChangePasswordResult = {
  data: unknown;
  error: null | { code?: string; message: string };
};
const changePasswordMock = vi.fn(
  async (_arg?: unknown): Promise<ChangePasswordResult> => ({
    data: {},
    error: null,
  }),
);
const toastSuccessMock = vi.fn<(msg: unknown) => void>();
const toastErrorMock = vi.fn<(msg: unknown) => void>();

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    changePassword: (arg: unknown) => changePasswordMock(arg),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: (msg: unknown) => toastSuccessMock(msg),
    error: (msg: unknown) => toastErrorMock(msg),
  },
}));

vi.mock("@zxcvbn-ts/core", () => ({
  zxcvbn: vi.fn(() => ({ score: 4 })),
  zxcvbnOptions: { setOptions: vi.fn() },
}));
vi.mock("@zxcvbn-ts/language-common", () => ({
  dictionary: {},
  adjacencyGraphs: {},
}));
vi.mock("@zxcvbn-ts/language-en", () => ({
  dictionary: {},
  translations: {},
}));

import { AccountSecuritySection } from "@/components/account/account-security-section";

describe("AccountSecuritySection", () => {
  beforeEach(() => {
    changePasswordMock.mockReset();
    changePasswordMock.mockResolvedValue({ data: {}, error: null });
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("renders Current password, New password, Confirm new password fields + PasswordStrengthBar", () => {
    render(<AccountSecuritySection />);
    expect(screen.getByLabelText(/Current password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^New password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirm new password/i)).toBeInTheDocument();
    expect(screen.getByTestId("password-strength-bar")).toBeInTheDocument();
  });

  it('section description is "Update your password. You will be signed out of other devices."', () => {
    render(<AccountSecuritySection />);
    expect(
      screen.getByText("Update your password. You will be signed out of other devices."),
    ).toBeInTheDocument();
  });

  it("submit disabled until all 3 fields filled and validation passes", async () => {
    render(<AccountSecuritySection />);
    const submit = screen.getByRole("button", { name: /Change password/i });
    expect(submit).toBeDisabled();
  });

  it('validates new password min 8 chars with error copy "Password must be at least 8 characters."', async () => {
    render(<AccountSecuritySection />);
    await userEvent.type(screen.getByLabelText(/Current password/i), "oldSecret1");
    await userEvent.type(screen.getByLabelText(/^New password$/i), "short");
    await userEvent.type(screen.getByLabelText(/Confirm new password/i), "short");
    // Tab out to trigger blur validation
    await userEvent.tab();
    await waitFor(() => {
      expect(
        screen.getByText("Password must be at least 8 characters."),
      ).toBeInTheDocument();
    });
  });

  it('validates newPassword !== currentPassword with error copy "New password must be different from your current password."', async () => {
    render(<AccountSecuritySection />);
    await userEvent.type(screen.getByLabelText(/Current password/i), "samePass123");
    await userEvent.type(screen.getByLabelText(/^New password$/i), "samePass123");
    await userEvent.type(screen.getByLabelText(/Confirm new password/i), "samePass123");
    await userEvent.tab();
    await waitFor(() => {
      expect(
        screen.getByText(
          "New password must be different from your current password.",
        ),
      ).toBeInTheDocument();
    });
  });

  it('validates confirmPassword matches newPassword with error copy "Passwords do not match."', async () => {
    render(<AccountSecuritySection />);
    await userEvent.type(screen.getByLabelText(/Current password/i), "oldSecret1");
    await userEvent.type(screen.getByLabelText(/^New password$/i), "newSecret99");
    await userEvent.type(screen.getByLabelText(/Confirm new password/i), "different99");
    await userEvent.tab();
    await waitFor(() => {
      expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    });
  });

  it("calls authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })", async () => {
    render(<AccountSecuritySection />);
    await userEvent.type(screen.getByLabelText(/Current password/i), "oldSecret1");
    await userEvent.type(screen.getByLabelText(/^New password$/i), "newSecret99");
    await userEvent.type(screen.getByLabelText(/Confirm new password/i), "newSecret99");
    await userEvent.click(screen.getByRole("button", { name: /Change password/i }));
    await waitFor(() => {
      expect(changePasswordMock).toHaveBeenCalledWith({
        currentPassword: "oldSecret1",
        newPassword: "newSecret99",
        revokeOtherSessions: true,
      });
    });
  });

  it('on INVALID_PASSWORD error code, sets inline error on Current password field with copy "Current password is incorrect."', async () => {
    changePasswordMock.mockResolvedValueOnce({
      data: null,
      error: { code: "INVALID_PASSWORD", message: "invalid" },
    });
    render(<AccountSecuritySection />);
    await userEvent.type(screen.getByLabelText(/Current password/i), "oldSecret1");
    await userEvent.type(screen.getByLabelText(/^New password$/i), "newSecret99");
    await userEvent.type(screen.getByLabelText(/Confirm new password/i), "newSecret99");
    await userEvent.click(screen.getByRole("button", { name: /Change password/i }));
    await waitFor(() => {
      expect(
        screen.getByText("Current password is incorrect."),
      ).toBeInTheDocument();
    });
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('on success, shows toast "Password changed. Signed out from other devices." and resets form', async () => {
    render(<AccountSecuritySection />);
    const current = screen.getByLabelText(/Current password/i) as HTMLInputElement;
    const next = screen.getByLabelText(/^New password$/i) as HTMLInputElement;
    const confirm = screen.getByLabelText(/Confirm new password/i) as HTMLInputElement;
    await userEvent.type(current, "oldSecret1");
    await userEvent.type(next, "newSecret99");
    await userEvent.type(confirm, "newSecret99");
    await userEvent.click(screen.getByRole("button", { name: /Change password/i }));
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Password changed. Signed out from other devices.",
      );
    });
    await waitFor(() => {
      expect(current.value).toBe("");
      expect(next.value).toBe("");
      expect(confirm.value).toBe("");
    });
  });
});
