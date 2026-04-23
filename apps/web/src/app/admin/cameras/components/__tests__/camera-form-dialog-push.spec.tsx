import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { CameraFormDialog } from '../camera-form-dialog';

/**
 * Phase 19.1 Plan 06 — Task 1 (D-08/09/10/11)
 *
 * These tests assert the push-mode extensions to the existing
 * camera-form-dialog:
 *   - IngestModeToggle visible in create mode, hidden in edit mode
 *   - Push mode hides streamUrl input + shows UI-SPEC-verbatim hint block
 *   - After push-create save, dialog body swaps to <CreatedUrlReveal>
 *   - Done on reveal calls onSuccess + onOpenChange(false)
 *
 * UI-SPEC verbatim copy assertions are intentional — any drift in dialog
 * copy will break these tests before reaching users.
 */

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

import { apiFetch } from '@/lib/api';

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

function baseProps(overrides?: Partial<Parameters<typeof CameraFormDialog>[0]>) {
  return {
    open: true,
    onOpenChange: () => {},
    onSuccess: () => {},
    defaultProjectId: 'proj-1',
    defaultSiteId: 'site-1',
    ...overrides,
  };
}

beforeEach(() => {
  installDefaultApiMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CameraFormDialog push mode (D-08/09/10)', () => {
  it('renders IngestModeToggle in create mode', () => {
    render(<CameraFormDialog {...baseProps()} />);
    expect(screen.getByText('Pull')).toBeInTheDocument();
    expect(screen.getByText('Push')).toBeInTheDocument();
  });

  it('does NOT render IngestModeToggle in edit mode', () => {
    render(
      <CameraFormDialog
        {...baseProps({
          camera: {
            id: 'c1',
            name: 'existing',
            streamUrl: 'rtsp://h/a',
          },
        })}
      />,
    );
    // Pull/Push toggle labels should be absent when editing
    expect(screen.queryByText(/^Pull$/)).toBeNull();
    expect(screen.queryByText(/^Push$/)).toBeNull();
  });

  it('selecting Push hides streamUrl field and shows UI-SPEC hint block', async () => {
    render(<CameraFormDialog {...baseProps()} />);
    fireEvent.click(screen.getByText('Push'));

    await waitFor(() => {
      expect(
        screen.getByText("We'll generate a push URL after you save."),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/H\.264 video \+ AAC audio are recommended/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Setup guide/)).toBeInTheDocument();
    // streamUrl input label should not be visible in push mode
    expect(screen.queryByLabelText(/Stream URL/)).toBeNull();
  });

  it('switching back to Pull restores the streamUrl field', async () => {
    render(<CameraFormDialog {...baseProps()} />);
    fireEvent.click(screen.getByText('Push'));
    await waitFor(() =>
      expect(
        screen.getByText("We'll generate a push URL after you save."),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('Pull'));
    await waitFor(() => {
      expect(screen.getByLabelText(/Stream URL/)).toBeInTheDocument();
    });
  });

  it('on push-mode save, swaps to CreatedUrlReveal with returned streamUrl', async () => {
    const fn = apiFetch as unknown as ApiFetchMock;
    fn.mockImplementation(async (path: string, options?: RequestInit) => {
      if (
        options?.method === 'POST' &&
        /\/api\/sites\/.+\/cameras/.test(path)
      ) {
        return {
          id: 'c1',
          ingestMode: 'push',
          streamUrl: 'rtmp://host:1935/push/GEN123',
        };
      }
      if (path === '/api/projects') return [{ id: 'proj-1', name: 'Project 1' }];
      if (path === '/api/stream-profiles') return [];
      if (path.startsWith('/api/projects/') && path.endsWith('/sites')) {
        return [{ id: 'site-1', name: 'Site 1' }];
      }
      return [];
    });

    render(<CameraFormDialog {...baseProps()} />);
    fireEvent.click(screen.getByText('Push'));
    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: 'my-cam' },
    });
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Save Camera/i });
      expect(btn).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Camera/i }));

    await waitFor(() =>
      expect(screen.getByText('Camera created')).toBeInTheDocument(),
    );
    expect(
      (screen.getByLabelText('Generated push URL') as HTMLInputElement).value,
    ).toBe('rtmp://host:1935/push/GEN123');
  });

  it('Done on reveal triggers onSuccess + onOpenChange(false)', async () => {
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();

    const fn = apiFetch as unknown as ApiFetchMock;
    fn.mockImplementation(async (path: string, options?: RequestInit) => {
      if (
        options?.method === 'POST' &&
        /\/api\/sites\/.+\/cameras/.test(path)
      ) {
        return {
          id: 'c1',
          ingestMode: 'push',
          streamUrl: 'rtmp://h/push/X',
        };
      }
      if (path === '/api/projects') return [{ id: 'proj-1', name: 'Project 1' }];
      if (path === '/api/stream-profiles') return [];
      if (path.startsWith('/api/projects/') && path.endsWith('/sites')) {
        return [{ id: 'site-1', name: 'Site 1' }];
      }
      return [];
    });

    render(
      <CameraFormDialog
        {...baseProps({
          onSuccess,
          onOpenChange,
        })}
      />,
    );
    fireEvent.click(screen.getByText('Push'));
    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: 'cam' },
    });
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Save Camera/i });
      expect(btn).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Camera/i }));

    await waitFor(() =>
      expect(screen.getByText('Camera created')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /^Done$/ }));
    expect(onSuccess).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
