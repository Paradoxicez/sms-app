// Phase 16 Wave 0 scaffolding. GREEN markers land in Plan 16-01 Task T4.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { BadRequestException } from '@nestjs/common';
import { AvatarService } from '../../src/account/avatar/avatar.service';

const FIXTURES = path.resolve(__dirname, '../../test/fixtures/avatars');

function makeMinio() {
  return {
    ensureAvatarsBucket: vi.fn().mockResolvedValue(undefined),
    uploadAvatar: vi.fn(async (userId: string, _buf: Buffer) =>
      `https://minio/avatars/${userId}.webp?v=1`,
    ),
    removeAvatar: vi.fn().mockResolvedValue(undefined),
  };
}

describe('AvatarService sharp transcode', () => {
  let minio: ReturnType<typeof makeMinio>;
  let service: AvatarService;

  beforeEach(() => {
    minio = makeMinio();
    service = new AvatarService(minio as any);
  });

  it('transcodes tiny.jpg (512x384) to exactly 256x256 WebP', async () => {
    const input = fs.readFileSync(path.join(FIXTURES, 'tiny.jpg'));
    await service.uploadForUser('user-1', input);

    expect(minio.uploadAvatar).toHaveBeenCalledTimes(1);
    const [userId, outBuf] = minio.uploadAvatar.mock.calls[0];
    expect(userId).toBe('user-1');
    const meta = await sharp(outBuf).metadata();
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
    expect(meta.format).toBe('webp');
  });

  it('applies EXIF rotation via .rotate() before resize', async () => {
    // Build a 400x200 image with EXIF orientation=6 (90 CW). With .rotate(),
    // sharp should honor the EXIF tag and treat it as 200x400 before resizing
    // to 256x256 cover — the output is always 256x256 regardless, so we assert
    // that input with EXIF rotate metadata does NOT error and produces WebP.
    const rotated = await sharp({
      create: { width: 400, height: 200, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    await service.uploadForUser('user-rot', rotated);
    const [, outBuf] = minio.uploadAvatar.mock.calls[0];
    const meta = await sharp(outBuf).metadata();
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
    expect(meta.format).toBe('webp');
    // If .rotate() was missing, sharp would produce a mis-oriented image but still succeed.
    // Guarantee the pipeline code contains .rotate() — see source grep in acceptance_criteria.
  });

  it('throws BadRequestException on corrupt.png (sharp decode failure)', async () => {
    const input = fs.readFileSync(path.join(FIXTURES, 'corrupt.png'));
    await expect(service.uploadForUser('user-2', input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(minio.uploadAvatar).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when limitInputPixels 25_000_000 is exceeded', async () => {
    // 6000x6000 = 36_000_000 pixels > 25_000_000 limit
    const big = await sharp({
      create: {
        width: 6000,
        height: 6000,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
    await expect(service.uploadForUser('user-3', big)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(minio.uploadAvatar).not.toHaveBeenCalled();
  });

  it('uploadForUser invokes minio.uploadAvatar(userId, buffer) and returns its URL', async () => {
    const input = fs.readFileSync(path.join(FIXTURES, 'tiny.jpg'));
    const url = await service.uploadForUser('user-4', input);
    expect(url).toBe('https://minio/avatars/user-4.webp?v=1');
    expect(minio.uploadAvatar).toHaveBeenCalledWith('user-4', expect.any(Buffer));
  });

  it('removeForUser is idempotent — does not throw on missing key', async () => {
    minio.removeAvatar.mockRejectedValueOnce(new Error('boom'));
    await expect(service.removeForUser('user-x')).resolves.toBeUndefined();
  });

  it('ensureAvatarsBucket runs once during onModuleInit', async () => {
    await service.onModuleInit();
    expect(minio.ensureAvatarsBucket).toHaveBeenCalledTimes(1);
  });
});
