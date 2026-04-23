// Phase 19.1 Plan 03 — real fixture implementation.
// Shared test fixture for push-mode cameras. Plans 01–04 consume this.
// Usage:
//   const { camera, streamKey, pushUrl } = await createPushCameraFixture(orgId, siteId, prisma);

import type { PrismaClient } from '@prisma/client';
import { generateStreamKey, buildPushUrl } from '../../src/cameras/stream-key.util';

export interface PushCameraFixture {
  camera: any; // Camera row with ingestMode='push'
  streamKey: string; // 21-char nanoid
  pushUrl: string; // rtmp://host:1935/push/{key}
}

export async function createPushCameraFixture(
  orgId: string,
  siteId: string,
  prisma: PrismaClient,
  overrides?: { streamKey?: string; name?: string },
): Promise<PushCameraFixture> {
  const streamKey = overrides?.streamKey ?? generateStreamKey();
  const pushHost = process.env.SRS_PUBLIC_HOST ?? 'localhost';
  const pushUrl = buildPushUrl(pushHost, streamKey);
  const camera = await (prisma as any).camera.create({
    data: {
      orgId,
      siteId,
      name: overrides?.name ?? `push-cam-${streamKey.slice(0, 4)}`,
      streamUrl: pushUrl,
      ingestMode: 'push',
      streamKey,
      status: 'offline',
      needsTranscode: false,
    },
  });
  return { camera, streamKey, pushUrl };
}
