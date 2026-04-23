// Phase 19.1 Wave 0 scaffold — implemented by referenced plan.
// Shared test fixture for push-mode cameras. Plans 01–04 consume this.
// Usage:
//   const { camera, streamKey, pushUrl } = await createPushCameraFixture(orgId, siteId, prisma);
//
// This is a STUB — Plan 01 fills in the real implementation once the
// schema has ingestMode + streamKey columns. For now we export the
// signature so downstream test files compile.

import type { PrismaClient } from '@prisma/client';

export interface PushCameraFixture {
  camera: any; // Camera row with ingestMode='push'
  streamKey: string; // 21-char nanoid
  pushUrl: string; // rtmp://host:1935/push/{key}
}

export async function createPushCameraFixture(
  _orgId: string,
  _siteId: string,
  _prisma: PrismaClient,
  _overrides?: { streamKey?: string; name?: string },
): Promise<PushCameraFixture> {
  throw new Error('createPushCameraFixture not implemented — Plan 01 wires this');
}
