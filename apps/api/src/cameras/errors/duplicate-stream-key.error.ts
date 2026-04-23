// apps/api/src/cameras/errors/duplicate-stream-key.error.ts
//
// Phase 19.1 / D-04: translation target for Prisma P2002 on
// @@unique([streamKey]). Surfaces as HTTP 409 at the controller layer
// (mirrors Phase 19's DuplicateStreamUrlError contract).

import { ConflictException } from '@nestjs/common';

export class DuplicateStreamKeyError extends ConflictException {
  constructor() {
    super({
      statusCode: 409,
      error: 'Conflict',
      code: 'DUPLICATE_STREAM_KEY',
      message: 'Stream key collision — please try again',
    });
  }
}
