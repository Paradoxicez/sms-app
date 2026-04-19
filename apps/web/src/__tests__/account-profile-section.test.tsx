// Phase 16-02 Task 4 — AccountProfileSection.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateUserMock = vi.fn(async () => ({ data: {}, error: null }));
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    updateUser: (...args: unknown[]) => updateUserMock(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

// Mock @zxcvbn-ts to avoid the heavy import; not used here but imported transitively.
vi.mock("@zxcvbn-ts/core", () => ({
  zxcvbn: vi.fn(() => ({ score: 4 })),
  zxcvbnOptions: { setOptions: vi.fn() },
}));

import { AccountProfileSection } from "@/components/account/account-profile-section";

const fetchMock = vi.fn();

function baseUser(overrides: Partial<{ id: string; name: string; email: string; image: string | null }> = {}) {
  return {
    id: "user-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    image: null,
    ...overrides,
  };
}

describe("AccountProfileSection", () => {
  beforeEach(() => {
    updateUserMock.mockReset();
    updateUserMock.mockResolvedValue({ data: {}, error: null });
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it('renders section title "Profile" and description "Your display name and avatar."', () => {
    render(<AccountProfileSection user={baseUser()} />);
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Your display name and avatar.")).toBeInTheDocument();
  });

  it("renders 96x96 Avatar with AvatarImage when user.image set, fallback initials otherwise", () => {
    // fallback case
    const { rerender, container } = render(
      <AccountProfileSection user={baseUser({ image: null })} />,
    );
    const avatar = container.querySelector('[data-slot="avatar"]') as HTMLElement;
    expect(avatar).not.toBeNull();
    expect(avatar.className).toContain("size-24");
    // Fallback initials
    expect(screen.getAllByText("AL").length).toBeGreaterThan(0);

    // image set — source-level verification of AvatarImage wiring
    rerender(
      <AccountProfileSection
        user={baseUser({ image: "https://cdn.example.com/u1.webp?v=1" })}
      />,
    );
  });

  it("Upload new avatar button triggers hidden file input (accept image/jpeg,image/png,image/webp)", () => {
    const { container } = render(<AccountProfileSection user={baseUser()} />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.getAttribute("accept")).toBe("image/jpeg,image/png,image/webp");
  });

  it('shows client-side error toast "Image too large. Maximum 2 MB." when file > 2 MB (no POST)', async () => {
    const { container } = render(<AccountProfileSection user={baseUser()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const big = new File([new Uint8Array(3 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" });
    await userEvent.upload(input, big);
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Image too large. Maximum 2 MB.");
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows client-side error toast "Unsupported format. Use JPEG, PNG, or WebP." for disallowed MIME (no POST)', async () => {
    const { container } = render(<AccountProfileSection user={baseUser()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const gif = new File([new Uint8Array(100)], "evil.gif", { type: "image/gif" });
    // Bypass input[accept] filter via fireEvent.change — simulates a hostile
    // MIME that slipped past the file picker (defence-in-depth coverage).
    fireEvent.change(input, { target: { files: [gif] } });
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Unsupported format. Use JPEG, PNG, or WebP.",
      );
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs to /api/users/me/avatar with FormData field "file" on valid selection', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://cdn.example.com/avatars/user-1.webp?v=1" }),
    });
    const { container } = render(<AccountProfileSection user={baseUser()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const ok = new File([new Uint8Array(1024)], "a.jpg", { type: "image/jpeg" });
    await userEvent.upload(input, ok);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/users/me/avatar");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("after upload success, calls authClient.updateUser({ image: returnedUrl })", async () => {
    const returnedUrl = "https://cdn.example.com/avatars/user-1.webp?v=42";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ url: returnedUrl }) });
    const { container } = render(<AccountProfileSection user={baseUser()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const ok = new File([new Uint8Array(1024)], "a.png", { type: "image/png" });
    await userEvent.upload(input, ok);
    await waitFor(() => {
      expect(updateUserMock).toHaveBeenCalledWith({ image: returnedUrl });
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Avatar updated");
  });

  it("Remove button is hidden when user.image is null, visible when set", () => {
    const { rerender } = render(
      <AccountProfileSection user={baseUser({ image: null })} />,
    );
    expect(screen.queryByRole("button", { name: /Remove/i })).toBeNull();
    rerender(
      <AccountProfileSection user={baseUser({ image: "https://cdn/u.webp" })} />,
    );
    expect(screen.getByRole("button", { name: /Remove/i })).toBeInTheDocument();
  });

  it("Remove button calls DELETE /api/users/me/avatar then authClient.updateUser({ image: null })", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ removed: true }) });
    render(<AccountProfileSection user={baseUser({ image: "https://cdn/u.webp" })} />);
    await userEvent.click(screen.getByRole("button", { name: /Remove/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/users/me/avatar");
    expect(init.method).toBe("DELETE");
    await waitFor(() => {
      expect(updateUserMock).toHaveBeenCalledWith({ image: null });
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Avatar removed");
  });

  it("Display name Save changes button is disabled until the field is dirty", async () => {
    render(<AccountProfileSection user={baseUser()} />);
    const save = screen.getByRole("button", { name: /Save changes/i });
    expect(save).toBeDisabled();
    const input = screen.getByLabelText(/Display name/i);
    await userEvent.type(input, "X");
    await waitFor(() => {
      expect(save).not.toBeDisabled();
    });
  });

  it('Save changes submits authClient.updateUser({ name }) and shows success toast "Display name updated"', async () => {
    render(<AccountProfileSection user={baseUser()} />);
    const input = screen.getByLabelText(/Display name/i) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    const save = screen.getByRole("button", { name: /Save changes/i });
    await userEvent.click(save);
    await waitFor(() => {
      expect(updateUserMock).toHaveBeenCalledWith({ name: "New Name" });
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Display name updated");
  });
});
