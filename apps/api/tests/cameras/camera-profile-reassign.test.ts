import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CamerasService } from '../../src/cameras/cameras.service';
import { fingerprintProfile } from '../../src/streams/profile-fingerprint.util';

/**
 * Phase 21 D-02: PATCH /api/cameras/:id with a streamProfileId change
 * triggers (or skips) a single-camera restart depending on:
 *  - whether the value actually changed
 *  - whether the OLD vs NEW profile fingerprints differ
 *  - whether the camera passes the eligibility gate
 *    (status ∈ {online, connecting, reconnecting, degraded} AND maintenanceMode=false)
 *
 * The chokepoint is StreamsService.enqueueProfileRestart in single-camera mode
 * (cameraId arg present). Audit row is written inside that method (Plan 02), so
 * this suite asserts the call shape but does not assert audit row contents
 * directly — those are covered in tests/streams/profile-restart-audit.test.ts.
 */
describe('Phase 21 — D-02 CamerasService.updateCamera profile reassignment trigger', () => {
  let service: CamerasService;
  let tenancy: any;
  let prisma: any;
  let streams: any;

  // Two FFmpeg-affecting profiles with different fingerprints.
  const profileA = {
    id: 'prof-A',
    codec: 'h264',
    preset: 'medium',
    resolution: '1920x1080',
    fps: 30,
    videoBitrate: '4000k',
    audioCodec: 'aac',
    audioBitrate: '128k',
  };
  const profileB = {
    id: 'prof-B',
    codec: 'h265',
    preset: 'fast',
    resolution: '1280x720',
    fps: 25,
    videoBitrate: '2000k',
    audioCodec: 'aac',
    audioBitrate: '128k',
  };
  // Identical fingerprint to profileA but a different id (D-02 skip case).
  const profileAClone = {
    id: 'prof-A-clone',
    codec: 'h264',
    preset: 'medium',
    resolution: '1920x1080',
    fps: 30,
    videoBitrate: '4000k',
    audioCodec: 'aac',
    audioBitrate: '128k',
  };

  beforeEach(() => {
    tenancy = {
      camera: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
    prisma = {};
    streams = {
      enqueueProfileRestart: vi.fn().mockResolvedValue({ affectedCameras: 1 }),
      stopStream: vi.fn(),
      startStream: vi.fn(),
    };

    // Match cameras.service.ts constructor positional order:
    //   tenancy, prisma, streams, probeQueue?, systemPrisma?, srsApi?, auditService?
    service = new CamerasService(tenancy, prisma, streams, undefined as any);
  });

  it('updateCamera with no streamProfileId in dto enqueues NO restart', async () => {
    tenancy.camera.findUnique.mockResolvedValueOnce({
      id: 'c1',
      orgId: 'o1',
      status: 'online',
      maintenanceMode: false,
      streamProfileId: profileA.id,
      streamProfile: profileA,
    });
    tenancy.camera.update.mockResolvedValueOnce({
      id: 'c1',
      orgId: 'o1',
      status: 'online',
      maintenanceMode: false,
      streamProfileId: profileA.id,
      streamProfile: profileA,
      name: 'Lobby Cam',
    });

    const result = await service.updateCamera('c1', { name: 'Lobby Cam' });

    expect(streams.enqueueProfileRestart).not.toHaveBeenCalled();
    expect(result.restartTriggered).toBe(false);
  });

  it('updateCamera with streamProfileId same as current value enqueues NO restart (no-op assignment)', async () => {
    tenancy.camera.findUnique.mockResolvedValueOnce({
      id: 'c1',
      orgId: 'o1',
      status: 'online',
      maintenanceMode: false,
      streamProfileId: profileA.id,
      streamProfile: profileA,
    });
    tenancy.camera.update.mockResolvedValueOnce({
      id: 'c1',
      orgId: 'o1',
      status: 'online',
      maintenanceMode: false,
      streamProfileId: profileA.id,
      streamProfile: profileA,
    });

    const result = await service.updateCamera('c1', {
      streamProfileId: profileA.id,
    });

    expect(streams.enqueueProfileRestart).not.toHaveBeenCalled();
    expect(result.restartTriggered).toBe(false);
  });

  it('updateCamera with new streamProfileId pointing to a profile of identical fingerprint enqueues NO restart (D-02 fingerprint-equality skip)', async () => {
    tenancy.camera.findUnique.mockResolvedValueOnce({
      id: 'c1',
      orgId: 'o1',
      status: 'online',
      maintenanceMode: false,
      streamProfileId: profileA.id,
      streamProfile: profileA,
    });
    tenancy.camera.update.mockResolvedValueOnce({
      id: 'c1',
      orgId: 'o1',
      status: 'online',
      maintenanceMode: false,
      streamProfileId: profileAClone.id,
      streamProfile: profileAClone,
    });

    const result = await service.updateCamera('c1', {
      streamProfileId: profileAClone.id,
    });

    // Fingerprints are equal → no enqueue, but the row update DID happen.
    expect(streams.enqueueProfileRestart).not.toHaveBeenCalled();
    expect(result.restartTriggered).toBe(false);
    expect(tenancy.camera.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ streamProfileId: profileAClone.id }),
      }),
    );
  });

  it('updateCamera with new streamProfileId pointing to a profile of DIFFERENT fingerprint enqueues exactly ONE restart for this single camera', async () => {
    tenancy.camera.findUnique.mockResolvedValueOnce({
      id: 'c1',
      orgId: 'o1',
      status: 'online',
      maintenanceMode: false,
      streamProfileId: profileA.id,
      streamProfile: profileA,
    });
    tenancy.camera.update.mockResolvedValueOnce({
      id: 'c1',
      orgId: 'o1',
      status: 'online',
      maintenanceMode: false,
      streamProfileId: profileB.id,
      streamProfile: profileB,
    });

    const result = await service.updateCamera('c1', {
      streamProfileId: profileB.id,
    });

    expect(streams.enqueueProfileRestart).toHaveBeenCalledTimes(1);
    const args = streams.enqueueProfileRestart.mock.calls[0][0];
    expect(args.cameraId).toBe('c1');
    expect(args.profileId).toBe(profileB.id);
    expect(args.oldFingerprint).toBe(fingerprintProfile(profileA));
    expect(args.newFingerprint).toBe(fingerprintProfile(profileB));
    expect(args.oldFingerprint).not.toBe(args.newFingerprint);
    expect(args.originPath).toBe('/api/cameras/c1');
    expect(args.originMethod).toBe('PATCH');
    expect(result.restartTriggered).toBe(true);
  });

  it('updateCamera changing streamProfileId from null → non-default profile enqueues a restart (camera previously had no profile)', async () => {
    tenancy.camera.findUnique.mockResolvedValueOnce({
      id: 'c1',
      orgId: 'o1',
      status: 'online',
      maintenanceMode: false,
      streamProfileId: null,
      streamProfile: null,
    });
    tenancy.camera.update.mockResolvedValueOnce({
      id: 'c1',
      orgId: 'o1',
      status: 'online',
      maintenanceMode: false,
      streamProfileId: profileA.id,
      streamProfile: profileA,
    });

    const result = await service.updateCamera('c1', {
      streamProfileId: profileA.id,
    });

    expect(streams.enqueueProfileRestart).toHaveBeenCalledTimes(1);
    const args = streams.enqueueProfileRestart.mock.calls[0][0];
    expect(args.cameraId).toBe('c1');
    expect(args.oldFingerprint).toBe('sha256:none');
    expect(args.newFingerprint).toBe(fingerprintProfile(profileA));
    expect(args.profileId).toBe(profileA.id);
    expect(result.restartTriggered).toBe(true);
  });

  it("updateCamera changing streamProfileId from non-null → null enqueues a restart (now uses default {codec:'auto', audioCodec:'aac'} which has its own fingerprint)", async () => {
    tenancy.camera.findUnique.mockResolvedValueOnce({
      id: 'c1',
      orgId: 'o1',
      status: 'online',
      maintenanceMode: false,
      streamProfileId: profileA.id,
      streamProfile: profileA,
    });
    tenancy.camera.update.mockResolvedValueOnce({
      id: 'c1',
      orgId: 'o1',
      status: 'online',
      maintenanceMode: false,
      streamProfileId: null,
      streamProfile: null,
    });

    const result = await service.updateCamera('c1', {
      streamProfileId: null,
    });

    expect(streams.enqueueProfileRestart).toHaveBeenCalledTimes(1);
    const args = streams.enqueueProfileRestart.mock.calls[0][0];
    expect(args.cameraId).toBe('c1');
    expect(args.oldFingerprint).toBe(fingerprintProfile(profileA));
    expect(args.newFingerprint).toBe('sha256:none');
    // null new id falls back to the 'none-sentinel' marker per plan spec.
    expect(args.profileId).toBe('none-sentinel');
    expect(result.restartTriggered).toBe(true);
  });

  it('updateCamera respects status filter: offline camera reassignment does NOT enqueue (camera not running anyway)', async () => {
    tenancy.camera.findUnique.mockResolvedValueOnce({
      id: 'c1',
      orgId: 'o1',
      status: 'offline',
      maintenanceMode: false,
      streamProfileId: profileA.id,
      streamProfile: profileA,
    });
    tenancy.camera.update.mockResolvedValueOnce({
      id: 'c1',
      orgId: 'o1',
      status: 'offline',
      maintenanceMode: false,
      streamProfileId: profileB.id,
      streamProfile: profileB,
    });

    const result = await service.updateCamera('c1', {
      streamProfileId: profileB.id,
    });

    expect(streams.enqueueProfileRestart).not.toHaveBeenCalled();
    expect(result.restartTriggered).toBe(false);
    // The DB row update still committed — only the enqueue was skipped.
    expect(tenancy.camera.update).toHaveBeenCalled();
  });

  it('updateCamera respects maintenance gate: maintenanceMode=true camera reassignment does NOT enqueue', async () => {
    tenancy.camera.findUnique.mockResolvedValueOnce({
      id: 'c1',
      orgId: 'o1',
      status: 'online',
      maintenanceMode: true,
      streamProfileId: profileA.id,
      streamProfile: profileA,
    });
    tenancy.camera.update.mockResolvedValueOnce({
      id: 'c1',
      orgId: 'o1',
      status: 'online',
      maintenanceMode: true,
      streamProfileId: profileB.id,
      streamProfile: profileB,
    });

    const result = await service.updateCamera('c1', {
      streamProfileId: profileB.id,
    });

    expect(streams.enqueueProfileRestart).not.toHaveBeenCalled();
    expect(result.restartTriggered).toBe(false);
  });

  it("Audit row 'camera.profile_hot_reload' is written for the affected camera with details.profileId pointing to the NEW profile", async () => {
    // The audit row itself is written inside StreamsService.enqueueProfileRestart
    // (Plan 02). Plan 03 verifies the call shape: cameraId is threaded so the
    // single-camera audit fires, and the NEW profileId is passed (not the OLD one).
    tenancy.camera.findUnique.mockResolvedValueOnce({
      id: 'c1',
      orgId: 'o1',
      status: 'online',
      maintenanceMode: false,
      streamProfileId: profileA.id,
      streamProfile: profileA,
    });
    tenancy.camera.update.mockResolvedValueOnce({
      id: 'c1',
      orgId: 'o1',
      status: 'online',
      maintenanceMode: false,
      streamProfileId: profileB.id,
      streamProfile: profileB,
    });

    await service.updateCamera(
      'c1',
      { streamProfileId: profileB.id },
      { userId: 'u1', userEmail: 'admin@example.com' },
    );

    expect(streams.enqueueProfileRestart).toHaveBeenCalledTimes(1);
    const args = streams.enqueueProfileRestart.mock.calls[0][0];
    expect(args.profileId).toBe(profileB.id); // NEW profile id, not OLD
    expect(args.cameraId).toBe('c1');
    expect(args.triggeredBy).toEqual({
      userId: 'u1',
      userEmail: 'admin@example.com',
    });
  });
});
