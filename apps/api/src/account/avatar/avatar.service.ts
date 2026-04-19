import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import sharp from 'sharp';
import { MinioService } from '../../recordings/minio.service';

/**
 * AvatarService — transcodes user-supplied images to a normalized 256x256 WebP
 * and uploads them to the shared `avatars` MinIO bucket.
 *
 * Pixel-bomb gate: sharp is constructed with `limitInputPixels: 25_000_000`
 * and `failOn: 'error'` so malformed or malicious inputs reject before any
 * decode buffer is materialized. This mitigates T-16-01 + T-16-06 from the
 * Phase 16 threat register.
 */
@Injectable()
export class AvatarService implements OnModuleInit {
  private readonly logger = new Logger(AvatarService.name);

  constructor(private readonly minio: MinioService) {}

  async onModuleInit(): Promise<void> {
    await this.minio.ensureAvatarsBucket();
  }

  async uploadForUser(userId: string, input: Buffer): Promise<string> {
    let webp: Buffer;
    try {
      webp = await sharp(input, {
        limitInputPixels: 25_000_000,
        failOn: 'error',
      })
        .rotate()
        .resize(256, 256, { fit: 'cover', position: 'centre' })
        .webp({ quality: 82 })
        .toBuffer();
    } catch (err) {
      this.logger.debug(
        `sharp decode failed for user ${userId}: ${(err as Error).message}`,
      );
      throw new BadRequestException('Invalid or corrupt image.');
    }
    return this.minio.uploadAvatar(userId, webp);
  }

  async removeForUser(userId: string): Promise<void> {
    try {
      await this.minio.removeAvatar(userId);
    } catch (err) {
      this.logger.debug(`removeForUser: ${(err as Error).message}`);
    }
  }
}
