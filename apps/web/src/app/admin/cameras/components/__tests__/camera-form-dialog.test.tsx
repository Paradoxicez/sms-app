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
    if (path === '/api/stream-profiles') return [];
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
      if (path === '/api/stream-profiles') return [];
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
      if (path === '/api/stream-profiles') return [];
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
