import { ConflictException } from '@nestjs/common';

/**
 * Quick 260426-lg5: Thrown by cameras.service when Prisma P2002 fires on the
 * (orgId, name) unique constraint.
 *
 * Translated to HTTP 409 by NestJS. The UI branches on
 * `error.code === 'DUPLICATE_CAMERA_NAME'` to show a user-friendly
 * message instead of the generic "Failed to create camera" fallback.
 *
 * Security: tenancy scoping at the DB layer ensures we only ever reach this
 * error when the name collides *within the caller's own org* — we never leak
 * cross-tenant camera existence (T-lg5-03).
 */
export class DuplicateCameraNameError extends ConflictException {
  constructor(name: string) {
    super({
      code: 'DUPLICATE_CAMERA_NAME',
      message: 'A camera with this name already exists in your organization.',
      name,
    });
  }
}
