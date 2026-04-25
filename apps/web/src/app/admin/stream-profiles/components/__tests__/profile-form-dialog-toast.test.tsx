import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileFormDialog } from '../profile-form-dialog';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

type ApiFetchMock = ReturnType<typeof vi.fn>;

const baseProfile = {
  id: 'p1',
  name: 'Test',
  codec: 'libx264',
  preset: 'veryfast',
  resolution: '1920x1080',
  fps: 30,
  videoBitrate: '2000',
  audioCodec: 'aac',
  audioBitrate: '128k',
  isDefault: false,
};

function editProps(overrides: Partial<Parameters<typeof ProfileFormDialog>[0]> = {}) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
    editProfile: { ...baseProfile },
    ...overrides,
  };
}

function clickSave() {
  // The Save button label varies between create ("Save Profile" / saving) and edit
  // ("Save Profile") — match by role + accessible name.
  const button = screen.getByRole('button', { name: /save profile/i });
  fireEvent.click(button);
}

beforeEach(() => {
  (apiFetch as unknown as ApiFetchMock).mockReset();
  (toast.success as unknown as ApiFetchMock).mockReset?.();
  (toast.info as unknown as ApiFetchMock).mockReset?.();
  (toast.error as unknown as ApiFetchMock).mockReset?.();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Phase 21 — D-06 ProfileFormDialog toast surfaces affectedCameras count', () => {
  it("on PATCH success with response.affectedCameras=0, toast text is 'Profile updated' (current behavior preserved)", async () => {
    (apiFetch as unknown as ApiFetchMock).mockResolvedValueOnce({
      id: 'p1',
      affectedCameras: 0,
    });
    render(<ProfileFormDialog {...editProps()} />);
    clickSave();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Profile updated'));
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("on PATCH success with response.affectedCameras=3, toast text is 'Profile updated · 3 camera(s) restarting with new settings'", async () => {
    (apiFetch as unknown as ApiFetchMock).mockResolvedValueOnce({
      id: 'p1',
      affectedCameras: 3,
    });
    render(<ProfileFormDialog {...editProps()} />);
    clickSave();
    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(
        'Profile updated · 3 camera(s) restarting with new settings',
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("on PATCH success with response.affectedCameras=1, toast uses 'camera(s)' literal (matches implementation)", async () => {
    (apiFetch as unknown as ApiFetchMock).mockResolvedValueOnce({
      id: 'p1',
      affectedCameras: 1,
    });
    render(<ProfileFormDialog {...editProps()} />);
    clickSave();
    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(
        expect.stringMatching(/1 camera\(s\) restarting/),
      ),
    );
  });

  it("toast severity is info-level when affectedCameras > 0 (per D-06 'info-level not warning')", async () => {
    (apiFetch as unknown as ApiFetchMock).mockResolvedValueOnce({
      id: 'p1',
      affectedCameras: 5,
    });
    render(<ProfileFormDialog {...editProps()} />);
    clickSave();
    await waitFor(() => expect(toast.info).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("toast severity stays success-level when affectedCameras=0 (preserves existing 'Profile updated' tone)", async () => {
    (apiFetch as unknown as ApiFetchMock).mockResolvedValueOnce({
      id: 'p1',
      affectedCameras: 0,
    });
    render(<ProfileFormDialog {...editProps()} />);
    clickSave();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("on PATCH failure (non-2xx), toast is error-level 'Failed to update profile' — no restart-count surfacing", async () => {
    (apiFetch as unknown as ApiFetchMock).mockRejectedValueOnce(new Error('boom'));
    render(<ProfileFormDialog {...editProps()} />);
    clickSave();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to update profile'),
    );
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('dialog only renders the toast variant for EDIT mode (isEdit=true); CREATE mode keeps "Profile created" unchanged', async () => {
    // CREATE mode: no editProfile. The server response would not carry
    // affectedCameras (Plan 02 only added it to PATCH); even if it did, the
    // create branch should NOT surface restart-count toasts.
    (apiFetch as unknown as ApiFetchMock).mockResolvedValueOnce({
      id: 'pNew',
      affectedCameras: 99,
    });
    render(
      <ProfileFormDialog
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
        editProfile={null}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^Name$/i), {
      target: { value: 'Brand New' },
    });
    clickSave();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Profile created'));
    expect(toast.info).not.toHaveBeenCalled();
  });
});
