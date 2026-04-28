import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { Readable } from 'stream';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: Client;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.client = new Client({
      endPoint: this.configService.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.configService.get<string>('MINIO_PORT', '9000'), 10),
      useSSL: this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.configService.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.configService.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
    });
    this.logger.log('MinIO client initialized');
  }

  async ensureBucket(orgId: string): Promise<void> {
    const bucket = `org-${orgId}`;
    const exists = await this.client.bucketExists(bucket);
    if (!exists) {
      await this.client.makeBucket(bucket);
      this.logger.log(`Created MinIO bucket: ${bucket}`);
    }
  }

  async uploadSegment(
    orgId: string,
    objectPath: string,
    buffer: Buffer,
    size: number,
  ): Promise<void> {
    const bucket = `org-${orgId}`;
    await this.client.putObject(bucket, objectPath, buffer, size);
  }

  async getPresignedUrl(
    orgId: string,
    objectPath: string,
    expirySeconds = 14400,
  ): Promise<string> {
    return this.client.presignedGetObject(
      `org-${orgId}`,
      objectPath,
      expirySeconds,
    );
  }

  async removeObject(orgId: string, objectPath: string): Promise<void> {
    await this.client.removeObject(`org-${orgId}`, objectPath);
  }

  async removeObjects(orgId: string, objectPaths: string[]): Promise<void> {
    await this.client.removeObjects(`org-${orgId}`, objectPaths);
  }

  async getObjectStream(orgId: string, objectPath: string): Promise<Readable> {
    return this.client.getObject(`org-${orgId}`, objectPath);
  }

  async ensureAvatarsBucket(): Promise<void> {
    const bucket = 'avatars';
    const exists = await this.client.bucketExists(bucket);
    if (!exists) {
      await this.client.makeBucket(bucket);
      this.logger.log(`Created MinIO bucket: ${bucket}`);
    }
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucket}/*`],
        },
      ],
    };
    await this.client.setBucketPolicy(bucket, JSON.stringify(policy));
    this.logger.log('Avatars bucket ready (public-read)');
  }

  async uploadAvatar(userId: string, buffer: Buffer): Promise<string> {
    const bucket = 'avatars';
    const objectName = `${userId}.webp`;
    await this.client.putObject(bucket, objectName, buffer, buffer.length, {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    return this.getAvatarUrl(userId, Date.now());
  }

  async removeAvatar(userId: string): Promise<void> {
    try {
      await this.client.removeObject('avatars', `${userId}.webp`);
    } catch (err: any) {
      // Idempotent — NoSuchKey / NotFound means already gone
      if (err?.code !== 'NoSuchKey' && err?.code !== 'NotFound') {
        throw err;
      }
      this.logger.debug(`removeAvatar: object ${userId}.webp already absent`);
    }
  }

  /**
   * Build a public URL for a MinIO object. Phase 27 (D-26): when
   * MINIO_PUBLIC_URL is set (production via Caddy), use it as the exact
   * prefix — this eliminates the mixed-content blocker where the legacy
   * `${MINIO_USE_SSL ? 'https' : 'http'}://${endpoint}:${port}/...` path
   * emitted `http://` even when the page was served over HTTPS, because
   * MINIO_USE_SSL describes the api↔minio SDK connection (internal HTTP)
   * not the browser-facing URL. Falls back to the legacy composition for
   * dev/non-Caddy environments.
   */
  private buildPublicUrl(bucket: string, objectName: string, version: number): string {
    const publicUrl = this.configService.get<string>('MINIO_PUBLIC_URL');
    if (publicUrl) {
      const base = publicUrl.replace(/\/+$/, ''); // strip trailing slashes
      return `${base}/${bucket}/${objectName}?v=${version}`;
    }
    // Legacy dev fallback: derive endpoint+port+scheme like before.
    const endpoint =
      this.configService.get<string>('MINIO_PUBLIC_ENDPOINT') ??
      this.configService.get<string>('MINIO_ENDPOINT', 'localhost');
    const port =
      this.configService.get<string>('MINIO_PUBLIC_PORT') ??
      this.configService.get<string>('MINIO_PORT', '9000');
    const scheme =
      this.configService.get<string>('MINIO_USE_SSL') === 'true' ? 'https' : 'http';
    return `${scheme}://${endpoint}:${port}/${bucket}/${objectName}?v=${version}`;
  }

  getAvatarUrl(userId: string, version?: number): string {
    const v = version ?? Date.now();
    return this.buildPublicUrl('avatars', `${userId}.webp`, v);
  }

  // ─── Snapshots (camera card thumbnails) ─────────────────────────────
  // Mirrors the avatar block above but with shorter Cache-Control and JPEG
  // content type. Snapshots are a regenerable cache — overwritten on each
  // refresh; the `?v=ts` URL suffix produced by getSnapshotUrl() handles
  // immediate cache busting on the client.

  async ensureSnapshotsBucket(): Promise<void> {
    const bucket = 'snapshots';
    const exists = await this.client.bucketExists(bucket);
    if (!exists) {
      await this.client.makeBucket(bucket);
      this.logger.log(`Created MinIO bucket: ${bucket}`);
    }
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucket}/*`],
        },
      ],
    };
    await this.client.setBucketPolicy(bucket, JSON.stringify(policy));
    this.logger.log('Snapshots bucket ready (public-read)');
  }

  async uploadSnapshot(cameraId: string, buffer: Buffer): Promise<string> {
    const bucket = 'snapshots';
    const objectName = `${cameraId}.jpg`;
    await this.client.putObject(bucket, objectName, buffer, buffer.length, {
      'Content-Type': 'image/jpeg',
      // Cache-Control deliberately short (60s) since snapshots are overwritten
      // on each on_publish refresh. The version query param (?v=ts) handles
      // immediate cache busting on the client; the 60s TTL keeps cross-tab
      // refetch cheap.
      'Cache-Control': 'public, max-age=60',
    });
    return this.getSnapshotUrl(cameraId, Date.now());
  }

  async removeSnapshot(cameraId: string): Promise<void> {
    try {
      await this.client.removeObject('snapshots', `${cameraId}.jpg`);
    } catch (err: any) {
      // Idempotent — NoSuchKey / NotFound means already gone.
      if (err?.code !== 'NoSuchKey' && err?.code !== 'NotFound') {
        throw err;
      }
      this.logger.debug(`removeSnapshot: object ${cameraId}.jpg already absent`);
    }
  }

  getSnapshotUrl(cameraId: string, version?: number): string {
    const v = version ?? Date.now();
    return this.buildPublicUrl('snapshots', `${cameraId}.jpg`, v);
  }
}
