/**
 * Phase 22 Plan 10 — Tenant Map page tag MultiSelect filter (D-20, D-21).
 *
 * Reference:
 *   .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-VALIDATION.md
 *     row 22-W2-MAP-FILTER — D-20 / D-21 — Map toolbar tag MultiSelect narrows
 *     visible markers (OR semantics, independent state)
 *
 * Mocking strategy (mirrors tenant-cameras-page.test.tsx):
 *   - `@/lib/api` apiFetch              → controlled per-test
 *   - `@/lib/auth-client` getSession    → empty session
 *   - `@/hooks/use-camera-status`       → no-op
 *   - `@/hooks/use-feature-check`       → enabled=true, loading=false
 *   - `@/components/hierarchy/use-hierarchy-data` → static stub
 *   - `@/components/map/camera-map`     → minimal stub that renders the
 *     camera names of the cameras prop so visible-marker assertions are
 *     possible without leaflet/jsdom interop.
 *   - `@/components/map/map-tree-overlay`         → no-op
 *   - `@/components/map/placement-mode`           → idle stubs
 *   - `@/app/admin/cameras/components/view-stream-sheet` → no-op
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { MapCamera } from '@/components/map/camera-map';

// ─── Mocks (MUST precede component import) ────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: vi
      .fn()
      .mockResolvedValue({ data: { session: { activeOrganizationId: 'org1' } } }),
  },
}));

vi.mock('@/hooks/use-camera-status', () => ({
  useCameraStatus: () => {},
}));

vi.mock('@/hooks/use-feature-check', () => ({
  useFeatureCheck: () => ({ enabled: true, loading: false }),
}));

vi.mock('@/components/hierarchy/use-hierarchy-data', () => ({
  useHierarchyData: () => ({ tree: null, isLoading: false, refresh: vi.fn() }),
}));

vi.mock('@/components/map/map-tree-overlay', () => ({
  MapTreeOverlay: () => null,
}));

vi.mock('@/components/map/placement-mode', () => ({
  usePlacementMode: () => ({
    state: { mode: 'idle' },
    onMapClick: vi.fn(),
    startPlacing: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
    isSubmitting: false,
  }),
  PlacementBanner: () => null,
  PlacementMarker: () => null,
}));

vi.mock('@/app/admin/cameras/components/view-stream-sheet', () => ({
  ViewStreamSheet: () => null,
}));

// Minimal CameraMap stub — renders camera names so we can assert which
// markers are visible after the filter is applied. Also re-exports MapCamera
// so the page's import resolves.
vi.mock('@/components/map/camera-map', () => {
  return {
    CameraMap: ({ cameras }: { cameras: Array<{ id: string; name: string }> }) => (
      <div data-testid="map-stub">
        {cameras.map((c) => (
          <div key={c.id} data-testid={`marker-${c.id}`}>
            {c.name}
          </div>
        ))}
      </div>
    ),
  };
});

import { apiFetch } from '@/lib/api';
import TenantMapPage from '../tenant-map-page';

const mockedFetch = vi.mocked(apiFetch);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RawCamera {
  id: string;
  name: string;
  status: string;
  location?: { lat: number; lng: number } | null;
  tags?: string[];
  description?: string | null;
}

function rawCam(overrides: Partial<RawCamera> & { id: string }): RawCamera {
  return {
    id: overrides.id,
    name: overrides.name ?? `Cam-${overrides.id}`,
    status: overrides.status ?? 'online',
    location: overrides.location ?? { lat: 1, lng: 2 },
    tags: overrides.tags ?? [],
    description: overrides.description ?? null,
  };
}

function setupApiFetch(cameras: RawCamera[], distinctTags: string[]) {
  mockedFetch.mockReset();
  mockedFetch.mockImplementation(async (path: string) => {
    if (path === '/api/cameras') return cameras as unknown as object;
    if (path === '/api/cameras/tags/distinct') return { tags: distinctTags };
    return undefined;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Phase 22 Plan 10 — TenantMapPage mapper propagates tags + description', () => {
  it('mapper threads tags + description from API response into MapCamera markers', async () => {
    setupApiFetch(
      [
        rawCam({ id: 'a', name: 'Lobby', tags: ['lobby', 'entrance'], description: 'Front door' }),
      ],
      ['lobby', 'entrance'],
    );
    render(<TenantMapPage />);
    // Marker rendered → camera made it through the mapper.
    expect(await screen.findByTestId('marker-a')).toBeInTheDocument();
    // Mapper assertion: this is a contract test on the page mapper. Read the
    // page source and confirm it propagates `tags` + `description` from the
    // API response to MapCamera. Pure code-shape check (Pitfall 6 mitigation).
    const src = readFileSync(
      path.resolve(__dirname, '..', 'tenant-map-page.tsx'),
      'utf8',
    );
    expect(src).toMatch(/tags:\s*\(c\.tags as[^)]*\)\s*\?\?\s*\[\]/);
    expect(src).toMatch(/description:\s*\(c\.description as[^)]*\)\s*\?\?\s*null/);
  });
});

describe('Phase 22 Plan 10 — Map toolbar tag MultiSelect filter', () => {
  it('renders a Tags filter trigger labeled "Tags" in the map toolbar', async () => {
    setupApiFetch(
      [rawCam({ id: 'a', tags: ['lobby'] })],
      ['lobby', 'entrance'],
    );
    render(<TenantMapPage />);
    expect(
      await screen.findByRole('button', { name: /^Tags(\b|$)/i }),
    ).toBeInTheDocument();
  });

  it('selecting a tag in toolbar filter narrows visible map markers', async () => {
    const user = userEvent.setup();
    setupApiFetch(
      [
        rawCam({ id: 'a', name: 'Lobby Cam', tags: ['lobby'] }),
        rawCam({ id: 'b', name: 'Door Cam', tags: ['entrance'] }),
        rawCam({ id: 'c', name: 'Roof Cam', tags: ['rooftop'] }),
      ],
      ['lobby', 'entrance', 'rooftop'],
    );
    render(<TenantMapPage />);
    // Wait for cameras to load.
    expect(await screen.findByTestId('marker-a')).toBeInTheDocument();
    expect(screen.getByTestId('marker-b')).toBeInTheDocument();
    expect(screen.getByTestId('marker-c')).toBeInTheDocument();

    // Open Tags filter and select 'lobby'.
    await user.click(screen.getByRole('button', { name: /^Tags(\b|$)/i }));
    const lobbyOption = await screen.findByRole('option', { name: /lobby/i });
    await user.click(lobbyOption);

    // Only marker-a remains.
    await waitFor(() => {
      expect(screen.getByTestId('marker-a')).toBeInTheDocument();
      expect(screen.queryByTestId('marker-b')).toBeNull();
      expect(screen.queryByTestId('marker-c')).toBeNull();
    });
  });

  it('multiple selected tags apply OR semantics (marker visible if ANY tag matches)', async () => {
    const user = userEvent.setup();
    setupApiFetch(
      [
        rawCam({ id: 'a', name: 'Lobby Cam', tags: ['lobby'] }),
        rawCam({ id: 'b', name: 'Door Cam', tags: ['entrance'] }),
        rawCam({ id: 'c', name: 'Roof Cam', tags: ['rooftop'] }),
      ],
      ['lobby', 'entrance', 'rooftop'],
    );
    render(<TenantMapPage />);
    expect(await screen.findByTestId('marker-a')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Tags(\b|$)/i }));
    await user.click(await screen.findByRole('option', { name: /lobby/i }));
    await user.click(await screen.findByRole('option', { name: /entrance/i }));

    await waitFor(() => {
      expect(screen.getByTestId('marker-a')).toBeInTheDocument();
      expect(screen.getByTestId('marker-b')).toBeInTheDocument();
      expect(screen.queryByTestId('marker-c')).toBeNull();
    });
  });

  it('clearing the filter restores all markers', async () => {
    const user = userEvent.setup();
    setupApiFetch(
      [
        rawCam({ id: 'a', name: 'Lobby Cam', tags: ['lobby'] }),
        rawCam({ id: 'b', name: 'Door Cam', tags: ['entrance'] }),
      ],
      ['lobby', 'entrance'],
    );
    render(<TenantMapPage />);
    expect(await screen.findByTestId('marker-a')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Tags(\b|$)/i }));
    await user.click(await screen.findByRole('option', { name: /lobby/i }));
    await waitFor(() => expect(screen.queryByTestId('marker-b')).toBeNull());

    // Clear via the explicit clear action inside the popover.
    const clear = await screen.findByRole('button', { name: /Clear filters/i });
    await user.click(clear);

    await waitFor(() => {
      expect(screen.getByTestId('marker-a')).toBeInTheDocument();
      expect(screen.getByTestId('marker-b')).toBeInTheDocument();
    });
  });

  it('tag matching is case-insensitive (camera tag "Lobby" matches selection "lobby")', async () => {
    const user = userEvent.setup();
    setupApiFetch(
      [
        rawCam({ id: 'a', name: 'Lobby Cam', tags: ['Lobby'] }),
        rawCam({ id: 'b', name: 'Door Cam', tags: ['Entrance'] }),
      ],
      ['lobby', 'entrance'],
    );
    render(<TenantMapPage />);
    expect(await screen.findByTestId('marker-a')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Tags(\b|$)/i }));
    await user.click(await screen.findByRole('option', { name: /lobby/i }));

    await waitFor(() => {
      expect(screen.getByTestId('marker-a')).toBeInTheDocument();
      expect(screen.queryByTestId('marker-b')).toBeNull();
    });
  });

  it('map filter state is independent from /admin/cameras filter state (D-21)', () => {
    // Contract: tenant-map-page must own its tag filter state via local
    // useState, NOT via context shared with tenant-cameras-page. Read the
    // map page source and confirm there is no shared-state import or any
    // import from tenant-cameras-page.
    const src = readFileSync(
      path.resolve(__dirname, '..', 'tenant-map-page.tsx'),
      'utf8',
    );
    // Must declare local state for selected tags.
    expect(src).toMatch(/useState[^\n]*selectedTags|selectedTags[^\n]*useState/);
    // Must NOT pull a shared-tag-filter context.
    expect(src).not.toMatch(/use(Shared|Global)Tag/);
    expect(src).not.toMatch(/from ['"]@\/contexts?\/tag-filter/);
    // Must NOT import from tenant-cameras-page.
    expect(src).not.toMatch(/tenant-cameras-page/);
  });

  it('distinct tags fetched once on mount (single GET /cameras/tags/distinct)', async () => {
    setupApiFetch([rawCam({ id: 'a', tags: ['lobby'] })], ['lobby']);
    render(<TenantMapPage />);
    await screen.findByTestId('marker-a');
    const distinctCalls = mockedFetch.mock.calls.filter(
      (c) => c[0] === '/api/cameras/tags/distinct',
    );
    expect(distinctCalls.length).toBe(1);
  });
});

// Silence unused imports.
void within;
void (null as unknown as MapCamera);
