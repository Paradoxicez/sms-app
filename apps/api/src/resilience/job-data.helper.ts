import type { StreamJobData } from '../streams/processors/stream.processor';

/**
 * Builds StreamJobData from a Prisma Camera row (with streamProfile relation).
 * Shared across StreamsService, BootRecoveryService, CameraHealthService,
 * and SrsRestartDetector so they all enqueue identical payloads.
 * Source shape: apps/api/src/streams/streams.service.ts:34-55
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

  return {
    cameraId: camera.id,
    orgId: camera.orgId,
    inputUrl: camera.streamUrl,
    profile,
    needsTranscode: camera.needsTranscode,
  };
}
