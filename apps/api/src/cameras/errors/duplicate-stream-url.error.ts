import { ConflictException } from '@nestjs/common';

/**
 * D-11: Thrown by cameras.service when Prisma P2002 fires on the
 * (orgId, streamUrl) unique constraint.
 *
 * Translated to HTTP 409 by NestJS. The UI (P06) branches on
 * `error.code === 'DUPLICATE_STREAM_URL'` to show a user-friendly
 * message instead of the generic "Failed to create camera" fallback.
 *
 * Security: the response body includes the offending streamUrl, but
 * tenancy scoping at the DB layer ensures we only ever reach this error
 * when the URL collides *within the caller's own org* — we never leak
 * cross-tenant camera existence (T-19-Enum-01).
 */
export class DuplicateStreamUrlError extends ConflictException {
  constructor(streamUrl: string) {
    super({
      code: 'DUPLICATE_STREAM_URL',
      message: 'A camera with this stream URL already exists in your organization.',
      streamUrl,
    });
  }
}
