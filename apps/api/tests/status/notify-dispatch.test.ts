import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotifyDispatchProcessor } from '../../src/status/processors/notify-dispatch.processor';

/**
 * Phase 22 Wave 1 — D-22 webhook tags.
 *
 * Reference: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-VALIDATION.md
 *   row 22-W1-WEBHOOK — D-22 — camera.online/camera.offline payload contains tags: string[]
 *
 * Owning plan: 22-03-PLAN.md
 *
 * Contract under test:
 *  - emitEvent payload includes `tags: string[]` for both camera.online and camera.offline
 *  - tags reflect Camera.tags (display casing preserved per D-04, NOT tagsNormalized)
 *  - Empty tags becomes `[]` — never undefined / null / omitted (stable schema)
 *  - description is NOT in payload (D-22 explicit exclusion)
 *  - cameraName is NOT in payload (D-22 explicit exclusion)
 */
describe('Phase 22: webhook tags (D-22)', () => {
  let processor: NotifyDispatchProcessor;
  let mockPrisma: any;
  let mockWebhooksService: any;
  let mockNotificationsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      camera: {
        findUnique: vi.fn(),
      },
    };

    mockWebhooksService = {
      emitEvent: vi.fn().mockResolvedValue(undefined),
    };

    mockNotificationsService = {
      createForCameraEvent: vi.fn().mockResolvedValue(undefined),
    };

    processor = new NotifyDispatchProcessor(
      mockPrisma,
      mockWebhooksService,
      mockNotificationsService,
    );
  });

  const jobStub = (overrides: Record<string, any> = {}) =>
    ({
      data: {
        orgId: 'org1',
        cameraId: 'cam1',
        cameraName: 'Cam 1',
        newStatus: 'offline',
        previousStatus: 'online',
        ...overrides,
      },
    }) as any;

  it('camera.online payload includes tags array (display casing preserved)', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam1',
      status: 'online',
      name: 'Cam 1',
      maintenanceMode: false,
      tags: ['Outdoor', 'Perimeter'],
      description: 'Front door cam',
    });

    await processor.process(jobStub({ newStatus: 'online', previousStatus: 'offline' }));

    expect(mockWebhooksService.emitEvent).toHaveBeenCalledTimes(1);
    expect(mockWebhooksService.emitEvent).toHaveBeenCalledWith(
      'org1',
      'camera.online',
      expect.objectContaining({
        cameraId: 'cam1',
        status: 'online',
        previousStatus: 'offline',
        tags: ['Outdoor', 'Perimeter'],
      }),
    );
  });

  it('camera.offline payload includes tags array (display casing preserved)', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam1',
      status: 'offline',
      name: 'Cam 1',
      maintenanceMode: false,
      tags: ['Outdoor', 'Perimeter'],
      description: 'Front door cam',
    });

    await processor.process(jobStub({ newStatus: 'offline', previousStatus: 'online' }));

    expect(mockWebhooksService.emitEvent).toHaveBeenCalledTimes(1);
    expect(mockWebhooksService.emitEvent).toHaveBeenCalledWith(
      'org1',
      'camera.offline',
      expect.objectContaining({
        cameraId: 'cam1',
        status: 'offline',
        previousStatus: 'online',
        tags: ['Outdoor', 'Perimeter'],
      }),
    );
  });

  it('empty tags emits tags: [] (not undefined / not omitted) for stable schema', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam1',
      status: 'offline',
      name: 'Cam 1',
      maintenanceMode: false,
      tags: [],
      description: null,
    });

    await processor.process(jobStub({ newStatus: 'offline' }));

    expect(mockWebhooksService.emitEvent).toHaveBeenCalledTimes(1);
    const payload = mockWebhooksService.emitEvent.mock.calls[0][2];
    expect(payload).toHaveProperty('tags');
    expect(payload.tags).toEqual([]);
    expect(payload.tags).not.toBeUndefined();
    expect(payload.tags).not.toBeNull();
  });

  it('description is NOT in payload (D-22 explicit exclusion)', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam1',
      status: 'offline',
      name: 'Cam 1',
      maintenanceMode: false,
      tags: ['Outdoor'],
      description: 'Front door cam',
    });

    await processor.process(jobStub({ newStatus: 'offline' }));

    expect(mockWebhooksService.emitEvent).toHaveBeenCalledTimes(1);
    const payload = mockWebhooksService.emitEvent.mock.calls[0][2];
    expect('description' in payload).toBe(false);
  });

  it('cameraName is NOT in payload (D-22 explicit exclusion)', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam1',
      status: 'offline',
      name: 'Cam 1',
      maintenanceMode: false,
      tags: ['Outdoor'],
      description: 'Front door cam',
    });

    await processor.process(jobStub({ newStatus: 'offline' }));

    expect(mockWebhooksService.emitEvent).toHaveBeenCalledTimes(1);
    const payload = mockWebhooksService.emitEvent.mock.calls[0][2];
    expect('cameraName' in payload).toBe(false);
    // also confirm no `name` leaked through
    expect('name' in payload).toBe(false);
  });
});
