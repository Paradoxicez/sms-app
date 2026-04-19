// Phase 16 Wave 0 scaffolding. GREEN markers land in Plan 16-01 Task T4.
import { describe, it } from 'vitest';

describe('AvatarService sharp transcode', () => {
  it.todo('transcodes tiny.jpg (512x384) to exactly 256x256 WebP');
  it.todo('applies EXIF rotation via .rotate() before resize');
  it.todo('throws BadRequestException on corrupt.png (sharp decode failure)');
  it.todo('throws BadRequestException when limitInputPixels 25_000_000 is exceeded');
  it.todo('uploadForUser invokes minio.uploadAvatar(userId, buffer) and returns its URL');
  it.todo('removeForUser is idempotent — does not throw on missing key');
  it.todo('ensureAvatarsBucket runs once during onModuleInit');
});
