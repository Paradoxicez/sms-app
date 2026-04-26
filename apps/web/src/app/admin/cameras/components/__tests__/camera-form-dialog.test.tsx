import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CameraFormDialog } from '../camera-form-dialog';

// Mock apiFetch so the dialog doesn't hit network for projects/sites/stream-profiles
// while still letting tests inject duplicate / generic errors on submit.
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

import { apiFetch, ApiError } from '@/lib/api';

type ApiFetchMock = ReturnType<typeof vi.fn>;

function installDefaultApiMocks() {
  const fn = apiFetch as unknown as ApiFetchMock;
  fn.mockImplementation(async (path: string) => {
    if (path === '/api/projects') return [{ id: 'proj-1', name: 'Project 1' }];
    // quick 260426-0nc: existing tests need a non-empty profile list so the
    // empty-state branch (which disables Save) doesn't fire and break them.
    if (path === '/api/stream-profiles') {
      return [{ id: 'p1', name: 'Default', isDefault: true }];
    }
    // quick 260426-lg5: empty cameras list by default; per-test override
    // injects rows to drive duplicate-detection assertions.
    if (path === '/api/cameras') return [];
    if (path.startsWith('/api/projects/') && path.endsWith('/sites')) {
      return [{ id: 'site-1', name: 'Site 1' }];
    }
    return [];
  });
}

function renderDialog(overrides?: Partial<Parameters<typeof CameraFormDialog>[0]>) {
  const props = {
    open: true,
    onOpenChange: () => {},
    onSuccess: () => {},
    defaultProjectId: 'proj-1',
    defaultSiteId: 'site-1',
    ...overrides,
  };
  return render(<CameraFormDialog {...props} />);
}

async function typeStreamUrl(value: string) {
  const input = screen.getByLabelText(/Stream URL/);
  fireEvent.change(input, { target: { value } });
  return input;
}

async function typeName(value: string) {
  const input = screen.getByLabelText(/^Name/);
  fireEvent.change(input, { target: { value } });
  return input;
}

beforeEach(() => {
  installDefaultApiMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CameraFormDialog Stream URL live validation — Phase 19 (D-15)', () => {
  it('typing "http://x" shows inline error "URL must start with rtsp://, rtmps://, rtmp://, or srt://"', async () => {
    renderDialog();
    await typeStreamUrl('http://x');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('URL must start with rtsp://, rtmps://, rtmp://, or srt://');
  });

  it('typing "rtmp://host/s" clears error and shows helper "Supported: rtsp://, rtmps://, rtmp://, srt://"', async () => {
    renderDialog();
    await typeStreamUrl('rtmp://host/s');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Supported: rtsp://, rtmps://, rtmp://, srt://')).toBeInTheDocument();
  });

  it('typing "rtmps://host/s" passes validation', async () => {
    renderDialog();
    await typeStreamUrl('rtmps://host/s');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('typing "srt://host" passes validation', async () => {
    renderDialog();
    await typeStreamUrl('srt://host');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('empty URL shows helper text, not error (HTML required handles empty)', async () => {
    renderDialog();
    expect(screen.getByText('Supported: rtsp://, rtmps://, rtmp://, srt://')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('pasting URL with leading whitespace still passes (trim before regex)', async () => {
    renderDialog();
    await typeStreamUrl('   rtsp://host/s   ');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('URL without hostname (e.g. "rtsp:///") shows "Invalid URL — check host and path"', async () => {
    renderDialog();
    await typeStreamUrl('rtsp:///');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invalid URL — check host and path');
  });

  it('Save button disabled while streamUrlError is truthy', async () => {
    renderDialog();
    await typeName('Test Camera');
    await typeStreamUrl('http://bad');
    const saveButton = screen.getByRole('button', { name: /Save Camera|Save Changes/ });
    expect(saveButton).toBeDisabled();
  });

  it('Save button enabled when name + streamUrl valid + siteId set', async () => {
    renderDialog();
    await typeName('Test Camera');
    await typeStreamUrl('rtmp://host/s');
    // site defaults to 'site-1' via defaultSiteId → once loaded, submit enables.
    await waitFor(() => {
      const saveButton = screen.getByRole('button', { name: /Save Camera|Save Changes/ });
      expect(saveButton).not.toBeDisabled();
    });
  });

  it('server 409 DUPLICATE_STREAM_URL shows "A camera with this stream URL already exists."', async () => {
    const fn = apiFetch as unknown as ApiFetchMock;
    // Override default mock: POST to cameras throws duplicate ApiError, reads succeed.
    fn.mockImplementation(async (path: string, options?: RequestInit) => {
      if (options?.method === 'POST' && /\/api\/sites\/.+\/cameras/.test(path)) {
        throw new ApiError(409, 'Conflict', { code: 'DUPLICATE_STREAM_URL', message: 'duplicate' });
      }
      if (path === '/api/projects') return [{ id: 'proj-1', name: 'Project 1' }];
      // quick 260426-0nc: non-empty profile list keeps Save enabled.
      if (path === '/api/stream-profiles') {
        return [{ id: 'p1', name: 'Default', isDefault: true }];
      }
      if (path === '/api/cameras') return [];
      if (path.startsWith('/api/projects/') && path.endsWith('/sites')) {
        return [{ id: 'site-1', name: 'Site 1' }];
      }
      return [];
    });

    renderDialog();
    await typeName('Test');
    await typeStreamUrl('rtsp://host/s');
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Save Camera|Save Changes/ });
      expect(btn).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Camera|Save Changes/ }));

    expect(
      await screen.findByText('A camera with this stream URL already exists.'),
    ).toBeInTheDocument();
  });

  it('server non-duplicate error shows generic "Failed to create camera…"', async () => {
    const fn = apiFetch as unknown as ApiFetchMock;
    fn.mockImplementation(async (path: string, options?: RequestInit) => {
      if (options?.method === 'POST' && /\/api\/sites\/.+\/cameras/.test(path)) {
        throw new ApiError(500, 'Internal Server Error', { message: 'boom' });
      }
      if (path === '/api/projects') return [{ id: 'proj-1', name: 'Project 1' }];
      // quick 260426-0nc: non-empty profile list keeps Save enabled.
      if (path === '/api/stream-profiles') {
        return [{ id: 'p1', name: 'Default', isDefault: true }];
      }
      if (path === '/api/cameras') return [];
      if (path.startsWith('/api/projects/') && path.endsWith('/sites')) {
        return [{ id: 'site-1', name: 'Site 1' }];
      }
      return [];
    });

    renderDialog();
    await typeName('Test');
    await typeStreamUrl('rtsp://host/s');
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Save Camera|Save Changes/ });
      expect(btn).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Camera|Save Changes/ }));

    expect(await screen.findByText(/Failed to create camera/i)).toBeInTheDocument();
  });

  it('aria-invalid + aria-describedby wired to error element id cam-url-error when error present', async () => {
    renderDialog();
    const input = await typeStreamUrl('http://x');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('cam-url-error');
  });

  it('aria-describedby points to helper id cam-url-help when no error', async () => {
    renderDialog();
    const input = screen.getByLabelText(/Stream URL/);
    expect(input.getAttribute('aria-describedby')).toBe('cam-url-help');
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });
});

describe('CameraFormDialog Stream Profile selection — quick 260426-0nc', () => {
  it('(a) create mode pre-selects org\'s isDefault profile', async () => {
    const fn = apiFetch as unknown as ApiFetchMock;
    fn.mockImplementation(async (path: string) => {
      if (path === '/api/projects') return [{ id: 'proj-1', name: 'Project 1' }];
      if (path === '/api/stream-profiles') {
        return [
          { id: 'p1', name: 'Pull Default', isDefault: true },
          { id: 'p2', name: 'High', isDefault: false },
        ];
      }
      if (path === '/api/cameras') return [];
      if (path.startsWith('/api/projects/') && path.endsWith('/sites')) {
        return [{ id: 'site-1', name: 'Site 1' }];
      }
      return [];
    });

    renderDialog();

    // After the async /api/stream-profiles fetch resolves and the create-mode
    // pre-select effect runs, the Stream Profile select trigger should
    // display the org's isDefault profile name. Three selects exist
    // (Project, Site, Stream Profile) — the Stream Profile select is the
    // last `[data-slot="select-value"]` in document order.
    await waitFor(() => {
      const selectValues = document.querySelectorAll('[data-slot="select-value"]');
      expect(selectValues.length).toBeGreaterThan(0);
      const streamProfileSelectValue = selectValues[selectValues.length - 1];
      expect(streamProfileSelectValue).toHaveTextContent('Pull Default');
    });
    // No hardcoded `Default` SelectItem present in the DOM.
    expect(screen.queryByRole('option', { name: 'Default' })).toBeNull();
  });

  it('(b) create mode + no isDefault profile + Save click → inline error and no POST', async () => {
    const fn = apiFetch as unknown as ApiFetchMock;
    fn.mockImplementation(async (path: string) => {
      if (path === '/api/projects') return [{ id: 'proj-1', name: 'Project 1' }];
      if (path === '/api/stream-profiles') {
        return [{ id: 'p2', name: 'High', isDefault: false }];
      }
      if (path === '/api/cameras') return [];
      if (path.startsWith('/api/projects/') && path.endsWith('/sites')) {
        return [{ id: 'site-1', name: 'Site 1' }];
      }
      return [];
    });

    renderDialog();
    await typeName('Test Camera');
    await typeStreamUrl('rtsp://host/s');
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Save Camera|Save Changes/ });
      expect(btn).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Camera|Save Changes/ }));

    expect(
      await screen.findByText('Please select a stream profile'),
    ).toBeInTheDocument();

    // Ensure no POST to /api/sites/:id/cameras happened.
    const postCalls = fn.mock.calls.filter((call) => {
      const path = call[0];
      const opts = call[1] as RequestInit | undefined;
      return (
        opts?.method === 'POST' &&
        typeof path === 'string' &&
        /\/api\/sites\/.+\/cameras/.test(path)
      );
    });
    expect(postCalls).toHaveLength(0);
  });

  it('(c) create mode + 0 profiles → empty-state callout + disabled Save', async () => {
    const fn = apiFetch as unknown as ApiFetchMock;
    fn.mockImplementation(async (path: string) => {
      if (path === '/api/projects') return [{ id: 'proj-1', name: 'Project 1' }];
      if (path === '/api/stream-profiles') return [];
      if (path === '/api/cameras') return [];
      if (path.startsWith('/api/projects/') && path.endsWith('/sites')) {
        return [{ id: 'site-1', name: 'Site 1' }];
      }
      return [];
    });

    renderDialog();
    expect(
      await screen.findByText('No stream profiles yet'),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', {
      name: /Create your first stream profile/,
    });
    expect(link.getAttribute('href')).toBe('/app/stream-profiles');
    // The Stream Profile Select trigger should be absent (replaced by callout).
    expect(screen.queryByText('Select a stream profile')).toBeNull();

    await typeName('Test Camera');
    await typeStreamUrl('rtsp://host/s');
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Save Camera|Save Changes/ }),
      ).toBeDisabled();
    });
  });

  it('(d) edit mode + camera has streamProfileId → pre-selects that profile, NOT org default', async () => {
    const fn = apiFetch as unknown as ApiFetchMock;
    fn.mockImplementation(async (path: string) => {
      if (path === '/api/projects') return [{ id: 'proj-1', name: 'Project 1' }];
      if (path === '/api/stream-profiles') {
        return [
          { id: 'p1', name: 'Pull Default', isDefault: true },
          { id: 'p2', name: 'High', isDefault: false },
        ];
      }
      if (path === '/api/cameras') return [];
      if (path.startsWith('/api/projects/') && path.endsWith('/sites')) {
        return [{ id: 'site-1', name: 'Site 1' }];
      }
      return [];
    });

    renderDialog({
      camera: {
        id: 'c1',
        name: 'cam',
        streamUrl: 'rtsp://h/s',
        streamProfileId: 'p2',
      },
    });

    await waitFor(() => {
      expect(screen.getByText('High')).toBeInTheDocument();
    });
    // The org's isDefault profile name should NOT appear (no auto-override).
    expect(screen.queryByText('Pull Default')).toBeNull();
  });

  it('(e) edit mode + legacy camera (streamProfileId === null) → amber warning + no auto-select', async () => {
    const fn = apiFetch as unknown as ApiFetchMock;
    fn.mockImplementation(async (path: string) => {
      if (path === '/api/projects') return [{ id: 'proj-1', name: 'Project 1' }];
      if (path === '/api/stream-profiles') {
        return [{ id: 'p1', name: 'Pull Default', isDefault: true }];
      }
      if (path === '/api/cameras') return [];
      if (path.startsWith('/api/projects/') && path.endsWith('/sites')) {
        return [{ id: 'site-1', name: 'Site 1' }];
      }
      return [];
    });

    renderDialog({
      camera: {
        id: 'c1',
        name: 'cam',
        streamUrl: 'rtsp://h/s',
        streamProfileId: null,
      },
    });

    expect(
      await screen.findByText(/no profile assigned/i),
    ).toBeInTheDocument();
    // Org default name must NOT appear in the trigger (no auto-override of legacy null).
    expect(screen.queryByText('Pull Default')).toBeNull();
  });
});

describe('CameraFormDialog inline duplicate detection — quick 260426-lg5', () => {
  function mockWithExisting(
    existing: Array<{ id: string; name: string; streamUrl: string }>,
  ) {
    const fn = apiFetch as unknown as ApiFetchMock;
    fn.mockImplementation(async (path: string) => {
      if (path === '/api/projects') return [{ id: 'proj-1', name: 'Project 1' }];
      if (path === '/api/stream-profiles') {
        return [{ id: 'p1', name: 'Default', isDefault: true }];
      }
      if (path === '/api/cameras') return existing;
      if (path.startsWith('/api/projects/') && path.endsWith('/sites')) {
        return [{ id: 'site-1', name: 'Site 1' }];
      }
      return [];
    });
  }

  it('typing existing name (case-insensitive + trimmed) shows inline alert + disables Save', async () => {
    mockWithExisting([
      { id: 'c1', name: 'Front Door', streamUrl: 'rtsp://existing/1' },
    ]);
    renderDialog();
    await waitFor(() => expect((apiFetch as unknown as ApiFetchMock).mock.calls.some(c => c[0] === '/api/cameras')).toBe(true));

    await typeName('Front Door');
    expect(
      await screen.findByText('A camera with this name already exists.'),
    ).toBeInTheDocument();

    // Case-insensitive
    await typeName('front door');
    expect(
      await screen.findByText('A camera with this name already exists.'),
    ).toBeInTheDocument();

    // Trimmed
    await typeName('  Front Door  ');
    expect(
      await screen.findByText('A camera with this name already exists.'),
    ).toBeInTheDocument();

    // Save disabled while alert is showing
    await typeStreamUrl('rtsp://new-unique/1');
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Save Camera|Save Changes/ }),
      ).toBeDisabled();
    });

    // Clear name → alert disappears, Save enables
    await typeName('Unique Name');
    await waitFor(() => {
      expect(
        screen.queryByText('A camera with this name already exists.'),
      ).toBeNull();
    });
  });

  it('typing existing streamUrl (exact) shows inline alert + disables Save', async () => {
    mockWithExisting([
      { id: 'c1', name: 'Front Door', streamUrl: 'rtsp://existing/1' },
    ]);
    renderDialog();
    await waitFor(() => expect((apiFetch as unknown as ApiFetchMock).mock.calls.some(c => c[0] === '/api/cameras')).toBe(true));

    await typeName('Some New Name');
    await typeStreamUrl('rtsp://existing/1');
    expect(
      await screen.findByText('A camera with this stream URL already exists.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Save Camera|Save Changes/ }),
      ).toBeDisabled();
    });
  });

  it('edit mode: typing the SAME name as the camera being edited does NOT show duplicate alert (self exclusion)', async () => {
    mockWithExisting([
      { id: 'c1', name: 'Front Door', streamUrl: 'rtsp://existing/1' },
    ]);
    renderDialog({
      camera: {
        id: 'c1',
        name: 'Front Door',
        streamUrl: 'rtsp://existing/1',
      },
    });
    await waitFor(() => expect((apiFetch as unknown as ApiFetchMock).mock.calls.some(c => c[0] === '/api/cameras')).toBe(true));

    // Name field starts populated with the camera's name and matches its own row.
    // The duplicate alert should NOT appear (self-row excluded).
    await waitFor(() => {
      expect(
        screen.queryByText('A camera with this name already exists.'),
      ).toBeNull();
    });
  });

  it('server 409 DUPLICATE_CAMERA_NAME (race past stale cache) shows friendly bottom-slot copy', async () => {
    const fn = apiFetch as unknown as ApiFetchMock;
    fn.mockImplementation(async (path: string, options?: RequestInit) => {
      if (options?.method === 'POST' && /\/api\/sites\/.+\/cameras/.test(path)) {
        throw new ApiError(409, 'Conflict', { code: 'DUPLICATE_CAMERA_NAME', message: 'duplicate' });
      }
      if (path === '/api/projects') return [{ id: 'proj-1', name: 'Project 1' }];
      if (path === '/api/stream-profiles') {
        return [{ id: 'p1', name: 'Default', isDefault: true }];
      }
      // Empty cache: client-side hint will not fire, only server 409 catches it.
      if (path === '/api/cameras') return [];
      if (path.startsWith('/api/projects/') && path.endsWith('/sites')) {
        return [{ id: 'site-1', name: 'Site 1' }];
      }
      return [];
    });

    renderDialog();
    await typeName('Race Cam');
    await typeStreamUrl('rtsp://host/s');
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Save Camera|Save Changes/ }),
      ).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Camera|Save Changes/ }));

    expect(
      await screen.findByText('A camera with this name already exists.'),
    ).toBeInTheDocument();
  });
});
