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

  getAvatarUrl(userId: string, version?: number): string {
    const endpoint =
      this.configService.get<string>('MINIO_PUBLIC_ENDPOINT') ??
      this.configService.get<string>('MINIO_ENDPOINT', 'localhost');
    const port =
      this.configService.get<string>('MINIO_PUBLIC_PORT') ??
      this.configService.get<string>('MINIO_PORT', '9000');
    const scheme =
      this.configService.get<string>('MINIO_USE_SSL') === 'true' ? 'https' : 'http';
    const v = version ?? Date.now();
    return `${scheme}://${endpoint}:${port}/avatars/${userId}.webp?v=${v}`;
  }
}
