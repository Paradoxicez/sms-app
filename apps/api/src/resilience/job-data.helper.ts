import type { StreamJobData } from '../streams/processors/stream.processor';

/**
 * Builds StreamJobData from a Prisma Camera row (with streamProfile relation).
 * Shared across StreamsService, BootRecoveryService, CameraHealthService,
 * and SrsRestartDetector so they all enqueue identical payloads.
 * Source shape: apps/api/src/streams/streams.service.ts:34-55
 *
 * Phase 19.1 D-17: for push cameras with a streamKey, read from the SRS
 * loopback (`rtmp://127.0.0.1:1935/push/<key>`) instead of `camera.streamUrl`
 * (which is the external publish URL and cannot be read from inside the
 * platform). BootRecovery / CameraHealth / SrsRestartDetector all route
 * through this helper so the same rule applies to auto-reconnect paths.
 */
export function buildStreamJobData(camera: any): StreamJobData {
  const profile = camera.streamProfile
    ? {
        codec: camera.streamProfile.codec,
        preset: camera.streamProfile.preset,
        resolution: camera.streamProfile.resolution,
        fps: camera.streamProfile.fps,
        videoBitrate: camera.streamProfile.videoBitrate,
        audioCodec: camera.streamProfile.audioCodec,
        audioBitrate: camera.streamProfile.audioBitrate,
      }
    : {
        codec: 'auto' as const,
        audioCodec: 'aac' as const,
      };

  const inputUrl =
    camera.ingestMode === 'push' && camera.streamKey
      ? `rtmp://127.0.0.1:1935/push/${camera.streamKey}`
      : camera.streamUrl;

  return {
    cameraId: camera.id,
    orgId: camera.orgId,
    inputUrl,
    profile,
    needsTranscode: camera.needsTranscode,
  };
}
