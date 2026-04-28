// Phase 16 Wave 0 scaffolding. GREEN markers land in Plan 16-01 Task T3.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock minio Client before importing MinioService
const mockClient = {
  bucketExists: vi.fn(),
  makeBucket: vi.fn(),
  setBucketPolicy: vi.fn(),
  putObject: vi.fn(),
  removeObject: vi.fn(),
  removeObjects: vi.fn(),
  getObject: vi.fn(),
  presignedGetObject: vi.fn(),
};

vi.mock('minio', () => ({
  Client: vi.fn(() => mockClient),
}));

import { MinioService } from '../../src/recordings/minio.service';

function makeConfig(overrides: Record<string, string | undefined> = {}) {
  const defaults: Record<string, string> = {
    MINIO_ENDPOINT: 'minio',
    MINIO_PORT: '9000',
    MINIO_USE_SSL: 'false',
    MINIO_ACCESS_KEY: 'minioadmin',
    MINIO_SECRET_KEY: 'minioadmin',
  };
  return {
    get: vi.fn(<T = string>(key: string, fallback?: T) => {
      if (key in overrides) {
        return overrides[key] as T | undefined;
      }
      if (key in defaults) {
        return defaults[key] as T;
      }
      return fallback;
    }),
  } as any;
}

async function bootService(config = makeConfig()) {
  const service = new MinioService(config);
  await service.onModuleInit();
  return service;
}

describe('MinioService avatars bucket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ensureAvatarsBucket creates bucket and applies public-read policy when missing', async () => {
    mockClient.bucketExists.mockResolvedValue(false);
    mockClient.makeBucket.mockResolvedValue(undefined);
    mockClient.setBucketPolicy.mockResolvedValue(undefined);

    const service = await bootService();
    await service.ensureAvatarsBucket();

    expect(mockClient.bucketExists).toHaveBeenCalledWith('avatars');
    expect(mockClient.makeBucket).toHaveBeenCalledWith('avatars');
    expect(mockClient.setBucketPolicy).toHaveBeenCalledWith(
      'avatars',
      expect.stringContaining('s3:GetObject'),
    );
    const policyArg = mockClient.setBucketPolicy.mock.calls[0][1] as string;
    expect(policyArg).toContain('arn:aws:s3:::avatars/*');
    expect(JSON.parse(policyArg).Version).toBe('2012-10-17');
  });

  it('ensureAvatarsBucket re-applies policy when bucket already exists', async () => {
    mockClient.bucketExists.mockResolvedValue(true);
    mockClient.setBucketPolicy.mockResolvedValue(undefined);

    const service = await bootService();
    await service.ensureAvatarsBucket();

    expect(mockClient.makeBucket).not.toHaveBeenCalled();
    expect(mockClient.setBucketPolicy).toHaveBeenCalledWith(
      'avatars',
      expect.stringContaining('s3:GetObject'),
    );
  });

  it('uploadAvatar writes {userId}.webp with Cache-Control public max-age=31536000 immutable', async () => {
    mockClient.putObject.mockResolvedValue(undefined);

    const service = await bootService();
    const buf = Buffer.from([1, 2, 3, 4]);
    const url = await service.uploadAvatar('user-42', buf);

    expect(mockClient.putObject).toHaveBeenCalledTimes(1);
    const [bucket, obj, passedBuf, size, headers] = mockClient.putObject.mock.calls[0];
    expect(bucket).toBe('avatars');
    expect(obj).toBe('user-42.webp');
    expect(passedBuf).toBe(buf);
    expect(size).toBe(buf.length);
    expect(headers).toMatchObject({
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    expect(url).toContain('/avatars/user-42.webp?v=');
  });

  it('removeAvatar swallows NoSuchKey (idempotent)', async () => {
    const err: any = new Error('gone');
    err.code = 'NoSuchKey';
    mockClient.removeObject.mockRejectedValue(err);

    const service = await bootService();
    await expect(service.removeAvatar('user-99')).resolves.toBeUndefined();
    expect(mockClient.removeObject).toHaveBeenCalledWith('avatars', 'user-99.webp');
  });

  it('removeAvatar propagates non-NoSuchKey errors', async () => {
    mockClient.removeObject.mockRejectedValue(Object.assign(new Error('boom'), { code: 'InternalError' }));
    const service = await bootService();
    await expect(service.removeAvatar('user-77')).rejects.toThrow('boom');
  });

  it('getAvatarUrl uses MINIO_PUBLIC_URL exactly when set (Phase 27 D-26 — fixes mixed content)', async () => {
    const config = makeConfig({
      MINIO_PUBLIC_URL: 'https://example.com',
      MINIO_USE_SSL: 'false', // SDK-side: internal http://minio:9000
    });
    const service = await bootService(config);
    const url = service.getAvatarUrl('user-1', 1234567890);
    expect(url).toBe('https://example.com/avatars/user-1.webp?v=1234567890');
    expect(url).toMatch(/^https:\/\//); // mixed-content regression guard
  });

  it('getSnapshotUrl uses MINIO_PUBLIC_URL exactly when set', async () => {
    const config = makeConfig({
      MINIO_PUBLIC_URL: 'https://example.com',
    });
    const service = await bootService(config);
    const url = service.getSnapshotUrl('cam-7', 99);
    expect(url).toBe('https://example.com/snapshots/cam-7.jpg?v=99');
    expect(url).toMatch(/^https:\/\//);
  });

  it('buildPublicUrl strips trailing slashes from MINIO_PUBLIC_URL (no double-slash)', async () => {
    const config = makeConfig({
      MINIO_PUBLIC_URL: 'https://example.com/',
    });
    const service = await bootService(config);
    const url = service.getAvatarUrl('u', 1);
    expect(url).toBe('https://example.com/avatars/u.webp?v=1');
    expect(url).not.toMatch(/\/\/avatars/);
  });

  it('getAvatarUrl falls back to legacy endpoint+port when MINIO_PUBLIC_URL unset (dev compat)', async () => {
    const config = makeConfig({
      MINIO_PUBLIC_URL: undefined,
      MINIO_PUBLIC_ENDPOINT: 'cdn.example.com',
      MINIO_PUBLIC_PORT: '443',
      MINIO_USE_SSL: 'true',
    });
    const service = await bootService(config);
    const url = service.getAvatarUrl('user-1', 1234567890);
    expect(url).toBe('https://cdn.example.com:443/avatars/user-1.webp?v=1234567890');
  });

  it('getAvatarUrl falls back to MINIO_ENDPOINT/MINIO_PORT when public overrides unset', async () => {
    const config = makeConfig({
      MINIO_PUBLIC_URL: undefined,
      MINIO_PUBLIC_ENDPOINT: undefined,
      MINIO_PUBLIC_PORT: undefined,
      MINIO_ENDPOINT: 'minio.internal',
      MINIO_PORT: '9001',
      MINIO_USE_SSL: 'false',
    });
    const service = await bootService(config);
    const url = service.getAvatarUrl('abc', 42);
    expect(url).toBe('http://minio.internal:9001/avatars/abc.webp?v=42');
  });
});
